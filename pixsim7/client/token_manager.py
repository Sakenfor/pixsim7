"""Token file management and MCP config generation.

Generic ``TokenFile`` handles the lifecycle of token files used to pass
auth credentials between processes (bridge → agent → MCP server).

MCP-specific helpers build config files (JSON for Claude, TOML for Codex)
that point agents at the pixsim MCP server with the correct token file.

Usage::

    from pixsim7.client.token_manager import TokenFile, build_mcp_env, render_claude_mcp_config

    tf = TokenFile.create(seed_token="initial-service-token", prefix="my-session")
    tf.write("fresh-user-token")
    assert tf.read() == "fresh-user-token"

    env = build_mcp_env(api_base="http://localhost:8000", token_file=tf, scope="dev")
    config_json = render_claude_mcp_config(env, python_cmd="python", mcp_server_script="/path/to/mcp_server.py")
"""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# ═══════════════════════════════════════════════════════════════════
# Generic token file
# ═══════════════════════════════════════════════════════════════════


@dataclass
class TokenFile:
    """A token stored in a temp file, readable by child processes.

    The file-based approach allows token rotation without restarting
    the consumer process — the MCP server re-reads the file on every
    API call.
    """

    path: str

    @classmethod
    def create(
        cls,
        seed_token: str = "",
        prefix: str = "pixsim",
        suffix: str = ".token",
        name: str | None = None,
    ) -> "TokenFile":
        """Create a new token file, optionally seeded with an initial token.

        When ``name`` is provided, the file lands in
        ``pixsim_mcp_config_dir()/<name>`` — stable across restarts and
        immune to ``%TEMP%`` sweeps. The bridge rewrites this file on every
        request (per-request user token), so a swept file is re-created on
        the next message as long as the (durable) stable dir exists — that
        per-request rewrite IS the token-file recovery path; no separate
        regenerator is needed once the file is no longer in %TEMP%.
        Plan: mcp-server-reliability / extend-stable-location-to-all-mcp-files.
        """
        if name is not None:
            return cls(path=_write_stable_file(name, seed_token))
        fd, path = tempfile.mkstemp(suffix=suffix, prefix=f"{prefix}-")
        with os.fdopen(fd, "w") as f:
            f.write(seed_token)
        return cls(path=path)

    def write(self, token: str) -> None:
        """Atomically update the token in the file."""
        try:
            with open(self.path, "w") as f:
                f.write(token)
        except OSError:
            pass

    def read(self) -> str:
        """Read the current token. Returns empty string on failure."""
        try:
            with open(self.path, "r") as f:
                return f.read().strip()
        except OSError:
            return ""

    def cleanup(self) -> None:
        """Delete the token file."""
        try:
            os.unlink(self.path)
        except OSError:
            pass

    @property
    def exists(self) -> bool:
        return os.path.exists(self.path)

    def __str__(self) -> str:
        return self.path


# ═══════════════════════════════════════════════════════════════════
# MCP environment variables (shared between Claude JSON + Codex TOML)
# ═══════════════════════════════════════════════════════════════════


@dataclass
class McpEnv:
    """MCP server environment variables — single source of truth.

    Both Claude (JSON) and Codex (TOML) configs set these same vars.
    """

    api_base: str
    api_token: str
    token_file: str
    scope: str
    bridge_managed: bool = True

    def to_dict(self) -> dict[str, str]:
        env = {
            "PIXSIM_API_URL": self.api_base,
            "PIXSIM_API_TOKEN": self.api_token,
            "PIXSIM_TOKEN_FILE": self.token_file,
            "PIXSIM_SCOPE": self.scope,
            "PYTHONIOENCODING": "utf-8",
        }
        if self.bridge_managed:
            env["PIXSIM_BRIDGE_MANAGED"] = "1"
        return env


def build_mcp_env(
    *,
    api_base: str,
    token_file: TokenFile | str,
    scope: str,
    api_token: str = "",
    bridge_managed: bool = True,
) -> McpEnv:
    """Build MCP env vars from components."""
    tf_path = str(token_file)
    # Use token from file if no explicit api_token provided
    if not api_token and isinstance(token_file, TokenFile):
        api_token = token_file.read()
    return McpEnv(
        api_base=api_base,
        api_token=api_token,
        token_file=tf_path,
        scope=scope,
        bridge_managed=bridge_managed,
    )


# ═══════════════════════════════════════════════════════════════════
# Claude MCP config (JSON)
# ═══════════════════════════════════════════════════════════════════


def render_claude_mcp_config(
    env: McpEnv,
    *,
    python_cmd: str,
    python_prefix: list[str] | None = None,
    mcp_server_script: str,
) -> str:
    """Render a Claude-compatible MCP config (JSON).

    Returns the JSON string. Caller writes it to a temp file and passes
    ``--mcp-config <path>`` to Claude.
    """
    args = [*(python_prefix or []), mcp_server_script]
    config = {
        "mcpServers": {
            "pixsim": {
                "command": python_cmd,
                "args": args,
                "env": env.to_dict(),
            }
        }
    }
    return json.dumps(config, indent=2)


def write_claude_mcp_config(
    env: McpEnv,
    *,
    python_cmd: str,
    python_prefix: list[str] | None = None,
    mcp_server_script: str,
    prefix: str = "pixsim-mcp",
    name: str | None = None,
) -> str:
    """Render and write a Claude MCP (STDIO) config file. Returns the path.

    When ``name`` is provided, writes to ``pixsim_mcp_config_dir()/<name>``
    — stable across restarts, immune to ``%TEMP%`` sweeps. Otherwise falls
    back to ``tempfile.mkstemp`` (legacy/standalone callers).
    """
    content = render_claude_mcp_config(
        env,
        python_cmd=python_cmd,
        python_prefix=python_prefix,
        mcp_server_script=mcp_server_script,
    )
    if name is not None:
        return _write_stable_file(name, content)
    fd, path = tempfile.mkstemp(suffix=".json", prefix=f"{prefix}-")
    with os.fdopen(fd, "w") as f:
        f.write(content)
    return path


# ═══════════════════════════════════════════════════════════════════
# Claude MCP config — HTTP transport (shared server)
# ═══════════════════════════════════════════════════════════════════


def render_claude_mcp_http_config(
    *,
    mcp_url: str,
    api_token: str = "",
    scope: str = "",
    session_id: str = "",
    profile_id: str = "",
) -> str:
    """Render a Claude-compatible MCP config pointing to an HTTP MCP server.

    Instead of ``command``/``args`` (STDIO), uses ``url``/``headers`` (HTTP).
    The shared MCP server filters tools per-request based on headers.
    """
    headers: dict[str, str] = {}
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    if scope:
        headers["X-Scope-Key"] = scope
    if session_id:
        headers["X-Chat-Session-Id"] = session_id
    if profile_id:
        headers["X-Profile-Id"] = profile_id

    config: dict = {
        "mcpServers": {
            "pixsim": {"type": "http", "url": mcp_url}
        }
    }
    if headers:
        config["mcpServers"]["pixsim"]["headers"] = headers
    return json.dumps(config, indent=2)


# ─── Stable MCP config directory ─────────────────────────────────
# Plan: launcher-health-probe-stability / stable-config-location.
# Previously every HTTP MCP config landed in ``%TEMP%`` via
# ``tempfile.mkstemp`` and got swept by Windows Storage Sense / Disk
# Cleanup, leaving stale paths in the bridge's cache. The robust fix
# (regenerator-on-missing, commit 5ad515d2d) handles the symptom; this
# helper closes the underlying cause by writing into a per-user dir
# that those sweepers leave alone (``~/.pixsim/mcp/``).
#
# Override via ``PIXSIM_MCP_CONFIG_DIR`` for tests (so they don't pollute
# the developer's real home dir).


def pixsim_mcp_config_dir() -> Path:
    """Stable per-user directory for HTTP MCP config files.

    Creates the directory on first call. Sets 0700 perms on Unix; on
    Windows the user-profile ACLs already restrict access. Env var
    ``PIXSIM_MCP_CONFIG_DIR`` overrides the default location (intended
    for tests).
    """
    override = os.environ.get("PIXSIM_MCP_CONFIG_DIR", "").strip()
    d = Path(override) if override else Path.home() / ".pixsim" / "mcp"
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(d, 0o700)
    except OSError:
        pass  # Windows / chmod-unsupported FS — best effort.
    return d


def sweep_old_mcp_configs(max_age_seconds: int = 48 * 3600) -> int:
    """Remove stale files from the stable MCP directory.

    Covers every file class that now lives here — HTTP/STDIO base configs,
    per-session clones, and per-session token files — by mtime alone (no
    extension filter). Files older than ``max_age_seconds`` are unlinked.
    Active sessions rewrite their token/config files, keeping mtime fresh,
    so only genuinely stale files (idle > cutoff, ~JWT TTL) are reaped.
    Returns the count removed. Never raises — sweep failures must not block
    bridge startup. Cheap enough to call once per bridge launch.
    """
    import time

    try:
        d = pixsim_mcp_config_dir()
    except OSError:
        return 0
    cutoff = time.time() - max_age_seconds
    removed = 0
    try:
        entries = list(d.iterdir())
    except OSError:
        return 0
    for entry in entries:
        try:
            if not entry.is_file():
                continue
            if entry.stat().st_mtime < cutoff:
                entry.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def _safe_stable_name(value: str, *, suffix: str, max_length: int = 60) -> str:
    """Deterministic, filesystem-safe name for a file in the stable MCP dir.

    Same value always maps to the same name so reopening across process
    restarts reuses the file (and the 48h sweep can age it out cleanly).
    """
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in value)
    safe = safe[:max_length] or "_"
    return f"{safe}{suffix}"


def _write_stable_file(name: str, content: str) -> str:
    """Write ``content`` to ``pixsim_mcp_config_dir()/<name>``; return path.

    Deterministic location, immune to ``%TEMP%`` sweeps (Storage Sense / Disk
    Cleanup leave the per-user dir alone). 0600 on Unix; Windows ignores the
    mode bits and relies on the parent dir's profile-scoped ACLs.
    Plan: mcp-server-reliability / extend-stable-location-to-all-mcp-files.
    """
    target = pixsim_mcp_config_dir() / name
    fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(content)
    return str(target)


def write_claude_mcp_http_config(
    *,
    mcp_url: str,
    api_token: str = "",
    scope: str = "",
    session_id: str = "",
    profile_id: str = "",
    prefix: str = "pixsim-mcp-http",
    name: str | None = None,
) -> str:
    """Write an HTTP-based Claude MCP config. Returns the path.

    When ``name`` is provided, writes to ``pixsim_mcp_config_dir()/<name>``
    — stable across process restarts and immune to ``%TEMP%`` sweeps.
    Otherwise falls back to ``tempfile.mkstemp`` so legacy callers that
    don't care about stability keep working unchanged.
    """
    content = render_claude_mcp_http_config(
        mcp_url=mcp_url,
        api_token=api_token,
        scope=scope,
        session_id=session_id,
        profile_id=profile_id,
    )
    if name is not None:
        return _write_stable_file(name, content)
    fd, path = tempfile.mkstemp(suffix=".json", prefix=f"{prefix}-")
    with os.fdopen(fd, "w") as f:
        f.write(content)
    return path


# ═══════════════════════════════════════════════════════════════════
# Codex MCP config (TOML)
# ═══════════════════════════════════════════════════════════════════


def _toml_quote(value: str) -> str:
    escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _toml_string_list(values: list[str]) -> str:
    return "[" + ", ".join(_toml_quote(v) for v in values) + "]"


def render_codex_mcp_config(
    env: McpEnv,
    *,
    python_cmd: str,
    python_prefix: list[str] | None = None,
    mcp_server_script: str,
    enabled_tools: list[str] | None = None,
    preferred_auth_method: str | None = "chatgpt",
) -> str:
    """Render a Codex-compatible MCP config (TOML).

    Returns the TOML string. Caller writes it to
    ``<workdir>/.codex/config.toml``.

    ``preferred_auth_method`` is pinned per-focus so bridge-spawned codex
    sessions don't inherit the machine-global ``~/.codex/config.toml``
    value. Defaults to ``"chatgpt"``: the bridge rides the user's
    ChatGPT/Codex subscription auth (which carries subscription-only
    models like ``gpt-5.3-codex``), not a platform API key that would
    404 on those models. Pass ``None`` to omit the key and fall back to
    the global config.
    """
    args = [mcp_server_script] if not python_prefix else [*python_prefix, mcp_server_script]
    lines: list[str] = []
    # Top-level keys must precede any [table] header in TOML.
    if preferred_auth_method:
        lines.append(f"preferred_auth_method = {_toml_quote(preferred_auth_method)}")
        lines.append("")
    lines += [
        "[mcp_servers.pixsim]",
        f"command = {_toml_quote(python_cmd)}",
        f"args = {_toml_string_list(args)}",
        "startup_timeout_sec = 30",
        "tool_timeout_sec = 60",
    ]
    if enabled_tools is not None:
        sorted_tools = sorted({tool for tool in enabled_tools if tool})
        lines.append(f"enabled_tools = {_toml_string_list(sorted_tools)}")

    env_dict = env.to_dict()
    # Normalize backslashes in token file path for TOML
    env_dict["PIXSIM_TOKEN_FILE"] = env_dict["PIXSIM_TOKEN_FILE"].replace("\\", "/")

    lines.append("")
    lines.append("[mcp_servers.pixsim.env]")
    for key, value in env_dict.items():
        lines.append(f"{key} = {_toml_quote(value)}")
    lines.append("")

    return "\n".join(lines)


def render_codex_mcp_http_config(
    *,
    mcp_url: str,
    api_token: str = "",
    scope: str = "",
    enabled_tools: list[str] | None = None,
    preferred_auth_method: str | None = "chatgpt",
) -> str:
    """Render a Codex-compatible MCP config pointing to an HTTP MCP server.

    Instead of ``command``/``args`` (STDIO), uses ``url`` (HTTP).
    Returns TOML string for ``<workdir>/.codex/config.toml``.

    See :func:`render_codex_mcp_config` for why ``preferred_auth_method``
    is pinned per-focus (default ``"chatgpt"``).
    """
    lines: list[str] = []
    # Top-level keys must precede any [table] header in TOML.
    if preferred_auth_method:
        lines.append(f"preferred_auth_method = {_toml_quote(preferred_auth_method)}")
        lines.append("")
    lines += [
        "[mcp_servers.pixsim]",
        f"url = {_toml_quote(mcp_url)}",
    ]
    if enabled_tools is not None:
        sorted_tools = sorted({tool for tool in enabled_tools if tool})
        lines.append(f"enabled_tools = {_toml_string_list(sorted_tools)}")

    # Headers for per-request context
    headers: dict[str, str] = {}
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
    if scope:
        headers["X-Scope-Key"] = scope
    if headers:
        lines.append("")
        lines.append("[mcp_servers.pixsim.headers]")
        for key, value in headers.items():
            lines.append(f"{_toml_quote(key)} = {_toml_quote(value)}")

    lines.append("")
    return "\n".join(lines)


def write_codex_mcp_http_config(
    *,
    mcp_url: str,
    api_token: str = "",
    scope: str = "",
    enabled_tools: list[str] | None = None,
    preferred_auth_method: str | None = "chatgpt",
    workdir: str | Path,
) -> str:
    """Write an HTTP-based Codex MCP config to ``<workdir>/.codex/config.toml``.

    Returns the config file path. Only writes if content changed.
    """
    content = render_codex_mcp_http_config(
        mcp_url=mcp_url,
        api_token=api_token,
        scope=scope,
        enabled_tools=enabled_tools,
        preferred_auth_method=preferred_auth_method,
    )
    codex_dir = Path(workdir) / ".codex"
    codex_dir.mkdir(parents=True, exist_ok=True)
    config_path = codex_dir / "config.toml"
    existing = ""
    if config_path.exists():
        try:
            existing = config_path.read_text(encoding="utf-8")
        except OSError:
            pass
    if existing != content:
        config_path.write_text(content, encoding="utf-8")
    return str(config_path)


def write_codex_mcp_config(
    env: McpEnv,
    *,
    python_cmd: str,
    python_prefix: list[str] | None = None,
    mcp_server_script: str,
    enabled_tools: list[str] | None = None,
    preferred_auth_method: str | None = "chatgpt",
    workdir: str | Path,
) -> str:
    """Render and write a Codex MCP config to ``<workdir>/.codex/config.toml``.

    Returns the config file path. Only writes if content changed.
    """
    content = render_codex_mcp_config(
        env,
        python_cmd=python_cmd,
        python_prefix=python_prefix,
        mcp_server_script=mcp_server_script,
        enabled_tools=enabled_tools,
        preferred_auth_method=preferred_auth_method,
    )
    codex_dir = Path(workdir) / ".codex"
    codex_dir.mkdir(parents=True, exist_ok=True)
    config_path = codex_dir / "config.toml"

    existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    if existing != content:
        config_path.write_text(content, encoding="utf-8")

    return str(config_path)


# ═══════════════════════════════════════════════════════════════════
# Per-session token isolation
# ═══════════════════════════════════════════════════════════════════


def clone_token_for_session(
    base_token_file: TokenFile | str,
    session_id: str,
) -> TokenFile:
    """Create a per-session token file seeded from a shared base.

    Each concurrent agent session gets its own token file so the bridge
    can write per-request user tokens without races. Lands in the stable
    MCP dir under a deterministic per-session name (immune to %TEMP%
    sweeps); same session_id reuses the same file across reconnects.
    """
    seed = ""
    if isinstance(base_token_file, TokenFile):
        seed = base_token_file.read()
    elif isinstance(base_token_file, str) and base_token_file:
        try:
            with open(base_token_file, "r") as f:
                seed = f.read().strip()
        except OSError:
            pass
    return TokenFile.create(
        seed_token=seed,
        name=_safe_stable_name(f"session-{session_id}", suffix=".token"),
    )


def is_http_mcp_config(config: dict) -> bool:
    """Single source of transport truth for a parsed Claude MCP config.

    Returns True iff the config has NO STDIO server — i.e. transport is
    purely HTTP (``url``/``headers``: identity rides in headers, there is
    no per-session ``env`` to patch, so no per-session clone is needed and
    the shared base config is used directly). An empty/serverless config
    counts as HTTP (nothing to clone). A mixed config (any STDIO server)
    is NOT HTTP — it needs cloning.

    NOTE: this is about a config *dict's shape*. It is unrelated to
    ``Bridge._mcp_http_url`` (whether the shared HTTP server process is
    running) — do not conflate the two.
    """
    servers = config.get("mcpServers", {})
    return all("url" in s for s in servers.values())


def clone_mcp_config_for_session(
    base_config_path: str,
    session_token_file: TokenFile,
    session_id: str | None = None,
) -> Optional[str]:
    """Clone a Claude MCP JSON config, overriding the token file path.

    For STDIO configs (command+args+env): overrides PIXSIM_TOKEN_FILE in env.
    For HTTP configs (url+headers): no cloning needed — returns None so
    the caller falls back to the unmodified base config (see
    ``is_http_mcp_config``).

    When ``session_id`` is provided the clone lands in the stable MCP dir
    under a deterministic per-session name (immune to %TEMP% sweeps; same
    session reuses the file across reconnects); otherwise ``tempfile.mkstemp``
    (legacy/standalone callers).

    Returns the cloned config path, or None on error / not applicable.
    """
    try:
        with open(base_config_path) as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    if is_http_mcp_config(config):
        return None

    for server in config.get("mcpServers", {}).values():
        if "url" in server:
            continue  # HTTP server in a mixed config — no env to patch
        env = server.get("env", {})
        env["PIXSIM_TOKEN_FILE"] = session_token_file.path
        server["env"] = env

    if session_id is not None:
        name = _safe_stable_name(f"session-{session_id}-mcp", suffix=".json")
        return _write_stable_file(name, json.dumps(config, indent=2))
    fd, path = tempfile.mkstemp(suffix=".json", prefix="pixsim-session-mcp-")
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, indent=2)
    return path
