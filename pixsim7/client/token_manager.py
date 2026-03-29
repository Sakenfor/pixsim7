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

    Returns the cloned config path, or None on error.
    """
    try:
        with open(base_config_path) as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    for server in config.get("mcpServers", {}).values():
        env = server.get("env", {})
        env["PIXSIM_TOKEN_FILE"] = session_token_file.path
        server["env"] = env

    fd, path = tempfile.mkstemp(suffix=".json", prefix="pixsim-session-mcp-")
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, indent=2)
    return path
