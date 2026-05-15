"""Tests for token_manager — generic token file ops + MCP config generation."""
from __future__ import annotations

TEST_SUITE = {
    "id": "token-manager",
    "label": "Token Manager & MCP Config",
    "kind": "unit",
    "category": "client",
    "subcategory": "token-management",
    "covers": [
        "pixsim7/client/token_manager.py",
    ],
    "order": 35,
}

import json
from pathlib import Path

import pytest

from pixsim7.client.token_manager import (
    McpEnv,
    TokenFile,
    build_mcp_env,
    clone_mcp_config_for_session,
    clone_token_for_session,
    render_claude_mcp_config,
    render_codex_mcp_config,
    write_claude_mcp_config,
    write_codex_mcp_config,
)


# ═══════════════════════════════════════════════════════════════════
# TokenFile — generic lifecycle
# ═══════════════════════════════════════════════════════════════════


class TestTokenFile:
    """Token file create/read/write/cleanup lifecycle."""

    def test_create_empty(self):
        tf = TokenFile.create()
        assert tf.exists
        assert tf.read() == ""
        tf.cleanup()
        assert not tf.exists

    def test_create_with_seed(self):
        tf = TokenFile.create(seed_token="initial-token")
        assert tf.read() == "initial-token"
        tf.cleanup()

    def test_write_and_read(self):
        tf = TokenFile.create(seed_token="old")
        assert tf.read() == "old"
        tf.write("new-token")
        assert tf.read() == "new-token"
        tf.cleanup()

    def test_write_overwrites_completely(self):
        tf = TokenFile.create(seed_token="a-very-long-initial-token")
        tf.write("short")
        assert tf.read() == "short"
        tf.cleanup()

    def test_read_strips_whitespace(self):
        tf = TokenFile.create(seed_token="  token-with-spaces  \n")
        assert tf.read() == "token-with-spaces"
        tf.cleanup()

    def test_read_after_cleanup_returns_empty(self):
        tf = TokenFile.create(seed_token="token")
        tf.cleanup()
        assert tf.read() == ""

    def test_double_cleanup_is_safe(self):
        tf = TokenFile.create()
        tf.cleanup()
        tf.cleanup()  # should not raise

    def test_str_returns_path(self):
        tf = TokenFile.create()
        assert str(tf) == tf.path
        tf.cleanup()

    def test_custom_prefix(self):
        tf = TokenFile.create(prefix="my-session")
        assert "my-session" in tf.path
        tf.cleanup()


# ═══════════════════════════════════════════════════════════════════
# McpEnv — environment variable builder
# ═══════════════════════════════════════════════════════════════════


class TestMcpEnv:
    """MCP environment variables — single source of truth."""

    def test_to_dict_includes_all_vars(self):
        env = McpEnv(
            api_base="http://localhost:8000",
            api_token="tok",
            token_file="/tmp/test.token",
            scope="dev",
        )
        d = env.to_dict()
        assert d["PIXSIM_API_URL"] == "http://localhost:8000"
        assert d["PIXSIM_API_TOKEN"] == "tok"
        assert d["PIXSIM_TOKEN_FILE"] == "/tmp/test.token"
        assert d["PIXSIM_SCOPE"] == "dev"
        assert d["PIXSIM_BRIDGE_MANAGED"] == "1"
        assert d["PYTHONIOENCODING"] == "utf-8"

    def test_bridge_managed_false_omits_var(self):
        env = McpEnv(
            api_base="http://localhost:8000",
            api_token="tok",
            token_file="/tmp/test.token",
            scope="dev",
            bridge_managed=False,
        )
        d = env.to_dict()
        assert "PIXSIM_BRIDGE_MANAGED" not in d

    def test_build_mcp_env_reads_token_from_file(self):
        tf = TokenFile.create(seed_token="file-token")
        env = build_mcp_env(api_base="http://localhost:8000", token_file=tf, scope="dev")
        assert env.api_token == "file-token"
        assert env.token_file == tf.path
        tf.cleanup()

    def test_build_mcp_env_explicit_token_overrides_file(self):
        tf = TokenFile.create(seed_token="file-token")
        env = build_mcp_env(
            api_base="http://localhost:8000",
            token_file=tf,
            scope="dev",
            api_token="explicit-token",
        )
        assert env.api_token == "explicit-token"
        tf.cleanup()

    def test_build_mcp_env_string_path(self):
        env = build_mcp_env(
            api_base="http://localhost:8000",
            token_file="/tmp/test.token",
            scope="user",
            api_token="tok",
        )
        assert env.token_file == "/tmp/test.token"


# ═══════════════════════════════════════════════════════════════════
# Claude MCP config (JSON)
# ═══════════════════════════════════════════════════════════════════


class TestClaudeMcpConfig:
    """Claude MCP JSON config generation."""

    def test_render_produces_valid_json(self):
        env = McpEnv(api_base="http://localhost:8000", api_token="tok",
                      token_file="/tmp/t.token", scope="dev")
        result = render_claude_mcp_config(
            env, python_cmd="python", mcp_server_script="/path/to/mcp_server.py",
        )
        parsed = json.loads(result)
        assert "mcpServers" in parsed
        assert "pixsim" in parsed["mcpServers"]

    def test_render_includes_all_env_vars(self):
        env = McpEnv(api_base="http://localhost:8000", api_token="tok",
                      token_file="/tmp/t.token", scope="dev")
        result = render_claude_mcp_config(
            env, python_cmd="python", mcp_server_script="/path/to/mcp.py",
        )
        parsed = json.loads(result)
        server_env = parsed["mcpServers"]["pixsim"]["env"]
        assert server_env["PIXSIM_API_URL"] == "http://localhost:8000"
        assert server_env["PIXSIM_TOKEN_FILE"] == "/tmp/t.token"
        assert server_env["PIXSIM_BRIDGE_MANAGED"] == "1"

    def test_render_with_python_prefix(self):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        result = render_claude_mcp_config(
            env, python_cmd="py", python_prefix=["-3"], mcp_server_script="/mcp.py",
        )
        parsed = json.loads(result)
        assert parsed["mcpServers"]["pixsim"]["args"] == ["-3", "/mcp.py"]

    def test_write_creates_file(self, tmp_path):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        path = write_claude_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )
        assert Path(path).exists()
        parsed = json.loads(Path(path).read_text())
        assert "mcpServers" in parsed
        Path(path).unlink()


# ═══════════════════════════════════════════════════════════════════
# Codex MCP config (TOML)
# ═══════════════════════════════════════════════════════════════════


class TestCodexMcpConfig:
    """Codex MCP TOML config generation."""

    def test_render_produces_valid_toml_structure(self):
        env = McpEnv(api_base="http://localhost:8000", api_token="tok",
                      token_file="/tmp/t.token", scope="dev")
        result = render_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/path/to/mcp.py",
        )
        assert "[mcp_servers.pixsim]" in result
        assert "[mcp_servers.pixsim.env]" in result
        assert 'PIXSIM_API_URL = "http://localhost:8000"' in result

    def test_render_with_enabled_tools(self):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        result = render_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
            enabled_tools=["call_api", "register_session", "list_assets"],
        )
        assert "enabled_tools" in result
        assert '"call_api"' in result
        assert '"list_assets"' in result

    def test_render_without_enabled_tools(self):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        result = render_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )
        assert "enabled_tools" not in result

    def test_render_normalizes_backslashes_in_token_path(self):
        env = McpEnv(api_base="http://x", api_token="t",
                      token_file="C:\\Users\\test\\token.tmp", scope="dev")
        result = render_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )
        assert "C:/Users/test/token.tmp" in result
        assert "\\\\" not in result  # no double backslashes

    def test_write_creates_codex_dir(self, tmp_path):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        workdir = tmp_path / "myproject"
        workdir.mkdir()
        path = write_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py", workdir=workdir,
        )
        assert Path(path).exists()
        assert ".codex" in path
        content = Path(path).read_text()
        assert "[mcp_servers.pixsim]" in content

    def test_write_skips_if_unchanged(self, tmp_path):
        env = McpEnv(api_base="http://x", api_token="t", token_file="/t", scope="dev")
        workdir = tmp_path / "proj"
        workdir.mkdir()

        path1 = write_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py", workdir=workdir,
        )
        mtime1 = Path(path1).stat().st_mtime_ns

        # Same content — should not rewrite
        import time
        time.sleep(0.01)
        path2 = write_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py", workdir=workdir,
        )
        mtime2 = Path(path2).stat().st_mtime_ns
        assert mtime1 == mtime2


# ═══════════════════════════════════════════════════════════════════
# Config parity — Claude and Codex get the same env vars
# ═══════════════════════════════════════════════════════════════════


class TestConfigParity:
    """Claude (JSON) and Codex (TOML) configs contain the same env vars."""

    def test_same_env_vars_in_both_formats(self):
        env = McpEnv(api_base="http://localhost:8000", api_token="shared-token",
                      token_file="/tmp/shared.token", scope="dev")

        claude_json = render_claude_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )
        codex_toml = render_codex_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )

        claude_env = json.loads(claude_json)["mcpServers"]["pixsim"]["env"]

        # Every env var in Claude config should also appear in Codex config
        for key, value in claude_env.items():
            # TOML uses forward slashes for paths
            expected = value.replace("\\", "/")
            assert f'{key} = "{expected}"' in codex_toml, f"{key} missing from Codex config"


# ═══════════════════════════════════════════════════════════════════
# Per-session token isolation
# ═══════════════════════════════════════════════════════════════════


class TestSessionTokenIsolation:
    """Per-session token files prevent races between concurrent tasks."""

    def test_clone_token_from_token_file(self):
        base = TokenFile.create(seed_token="base-service-token")
        session = clone_token_for_session(base, session_id="sess-1")

        assert session.path != base.path
        assert session.read() == "base-service-token"

        # Writing to session doesn't affect base
        session.write("user-token")
        assert session.read() == "user-token"
        assert base.read() == "base-service-token"

        base.cleanup()
        session.cleanup()

    def test_clone_token_from_string_path(self, tmp_path):
        base_path = tmp_path / "base.token"
        base_path.write_text("string-path-token")

        session = clone_token_for_session(str(base_path), session_id="sess-2")
        assert session.read() == "string-path-token"
        session.cleanup()

    def test_clone_mcp_config_overrides_token_file(self, tmp_path):
        # Create a base Claude MCP config
        env = McpEnv(api_base="http://x", api_token="t",
                      token_file="/tmp/base.token", scope="dev")
        base_path = write_claude_mcp_config(
            env, python_cmd="python", mcp_server_script="/mcp.py",
        )

        session_tf = TokenFile.create(seed_token="session-token")
        cloned_path = clone_mcp_config_for_session(base_path, session_tf)

        assert cloned_path is not None
        cloned = json.loads(Path(cloned_path).read_text())
        cloned_token_file = cloned["mcpServers"]["pixsim"]["env"]["PIXSIM_TOKEN_FILE"]
        assert cloned_token_file == session_tf.path
        assert cloned_token_file != "/tmp/base.token"

        Path(base_path).unlink()
        Path(cloned_path).unlink()
        session_tf.cleanup()

    def test_multiple_sessions_are_isolated(self):
        base = TokenFile.create(seed_token="shared")
        s1 = clone_token_for_session(base, session_id="a")
        s2 = clone_token_for_session(base, session_id="b")

        s1.write("token-for-user-1")
        s2.write("token-for-user-2")

        assert s1.read() == "token-for-user-1"
        assert s2.read() == "token-for-user-2"
        assert base.read() == "shared"

        base.cleanup()
        s1.cleanup()
        s2.cleanup()

    def test_clone_from_missing_file_returns_empty_token(self):
        session = clone_token_for_session("/nonexistent/path", session_id="x")
        assert session.read() == ""
        session.cleanup()
