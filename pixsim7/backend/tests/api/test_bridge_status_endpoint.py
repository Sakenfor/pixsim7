"""Regression: GET /meta/agents/bridge must not 500 before any start/stop.

`_server_bridge_process` is a module-level global that only start/stop assign,
but get_bridge_status reads it on every poll. Without a module-scope initializer
that read raises NameError → HTTP 500, which the frontend swallows as
`connected = 0` ("No agent connected") even while a bridge is live. This guards
the initializer against being dropped again by a future refactor.
"""
import pytest

import pixsim7.backend.main.api.v1.meta_contracts.routes.bridge as bridge_mod
from pixsim7.backend.main.api.v1.meta_contracts.routes.bridge import get_bridge_status


def test_server_bridge_process_defined_at_module_scope():
    # The read at get_bridge_status() line-149 requires this to exist.
    assert hasattr(bridge_mod, "_server_bridge_process")
    assert bridge_mod._server_bridge_process is None


@pytest.mark.asyncio
async def test_get_bridge_status_no_500_without_prior_start(monkeypatch):
    # No connected agents, launcher not managing anything → the code path that
    # touches _server_bridge_process (server_alive) and the launcher probe.
    # remote_cmd_bridge is imported lazily inside the endpoint, so patch the
    # singleton at its source module.
    from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge
    monkeypatch.setattr(remote_cmd_bridge, "get_agents", lambda **_: [])

    async def _no_launcher():
        return None

    monkeypatch.setattr(bridge_mod, "_check_launcher_bridge", _no_launcher)

    # Fresh process state: no start/stop has assigned the global yet.
    monkeypatch.setattr(bridge_mod, "_server_bridge_process", None, raising=False)

    result = await get_bridge_status(authorization=None)

    assert result.connected == 0
    assert result.process_alive is False
    assert result.agents == []
