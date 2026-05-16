"""Shared fixtures for client (bridge / agent-pool / token-manager) tests.

Plan: mcp-server-reliability / extend-stable-location-to-all-mcp-files.
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolated_mcp_config_dir(tmp_path, monkeypatch):
    """Redirect ``pixsim_mcp_config_dir()`` per-test so stable-path writes
    (base configs, per-session clones, AND token files) land in ``tmp_path``
    instead of the developer's real ``~/.pixsim/mcp/``.

    Applies to every test under ``tests/client`` — token_manager,
    agent_pool, bridge, and MCP-config-regeneration suites all now write
    token/config files into the stable dir.
    """
    monkeypatch.setenv("PIXSIM_MCP_CONFIG_DIR", str(tmp_path / "mcp"))
    yield
