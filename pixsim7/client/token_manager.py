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
    ) -> "TokenFile":
        """Create a new token file, optionally seeded with an initial token."""
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
) -> str:
    """Render and write a Claude MCP config file. Returns the file path."""
    content = render_claude_mcp_config(
        env,
        python_cmd=python_cmd,
        python_prefix=python_prefix,
        mcp_server_script=mcp_server_script,
    )
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
    """Remove stale MCP config files from the stable directory.

    Files older than ``max_age_seconds`` are unlinked. Returns the count
    removed. Never raises — sweep failures must not block bridge startup.
    Cheap enough to call once per bridge launch.
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
        target = pixsim_mcp_config_dir() / name
        # 0600 perms on Unix; Windows ignores the mode bits and relies on
        # the parent dir's profile-scoped ACLs.
        fd = os.open(
            str(target),
            os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
            0o600,
        )
        with os.fdopen(fd, "w") as f:
            f.write(content)
        return str(target)
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
) -> str:
    """Render a Codex-compatible MCP config (TOML).

    Returns the TOML string. Caller writes it to
    ``<workdir>/.codex/config.toml``.
    """
    args = [mcp_server_script] if not python_prefix else [*python_prefix, mcp_server_script]
    lines: list[str] = [
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
) -> str:
    """Render a Codex-compatible MCP config pointing to an HTTP MCP server.

    Instead of ``command``/``args`` (STDIO), uses ``url`` (HTTP).
    Returns TOML string for ``<workdir>/.codex/config.toml``.
    """
    lines: list[str] = [
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
    can write per-request user tokens without races.
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
    return TokenFile.create(seed_token=seed, prefix=f"pixsim-{session_id}")


def clone_mcp_config_for_session(
    base_config_path: str,
    session_token_file: TokenFile,
) -> Optional[str]:
    """Clone a Claude MCP JSON config, overriding the token file path.

    For STDIO configs (command+args+env): overrides PIXSIM_TOKEN_FILE in env.
    For HTTP configs (url+headers): no cloning needed — returns None so
    the caller falls back to the unmodified base config.

    Returns the cloned config path, or None on error / not applicable.
    """
    try:
        with open(base_config_path) as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    has_stdio = False
    for server in config.get("mcpServers", {}).values():
        if "url" in server:
            # HTTP transport — token is in headers, no env to patch
            continue
        has_stdio = True
        env = server.get("env", {})
        env["PIXSIM_TOKEN_FILE"] = session_token_file.path
        server["env"] = env

    if not has_stdio:
        return None

    fd, path = tempfile.mkstemp(suffix=".json", prefix="pixsim-session-mcp-")
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, indent=2)
    return path
