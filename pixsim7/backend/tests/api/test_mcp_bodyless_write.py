"""Regression: body-less writes must reach the backend as ``{}``, not ``None``.

A grouped/fine-grained MCP tool call with no ``body`` resolves to ``body=None``
in dispatch. FastAPI routes that declare a required body model then 422 on the
absent body — e.g. ``plans.claim`` / ``plans.release``, whose only field is
optional and which callers reasonably omit (the MCP schema marks just
``endpoint`` required). ``_proxy`` now substitutes an empty object for write
methods so a field-less write succeeds instead of failing on a field the agent
can't see.

See the handoff under plan ``dev-plans-surface`` (originally parked in
``agent-runnable-diagnostics``).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "mcp-bodyless-write",
    "label": "MCP body-less write coercion",
    "kind": "unit",
    "category": "backend/client",
    "subcategory": "mcp",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 46.6,
}

import pytest

try:
    import pixsim7.client.mcp_server as mcp

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")


class _FakeResponse:
    status_code = 200

    def json(self):
        return {"ok": True}

    @property
    def text(self):
        return '{"ok": true}'


class _CapturingClient:
    """Records the kwargs of the last request without doing any I/O."""

    def __init__(self):
        self.calls: list[dict] = []

    async def request(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse()


@pytest.fixture
def fake_client(monkeypatch):
    client = _CapturingClient()
    monkeypatch.setattr(mcp, "_get_client", lambda: client)
    monkeypatch.setattr(mcp, "_get_token", lambda: "tok")
    monkeypatch.setattr(mcp, "_identity_headers", lambda token: {})
    return client


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["POST", "PATCH", "PUT"])
async def test_bodyless_write_sends_empty_object(fake_client, method):
    await mcp._proxy(method=method, path="/dev/plans/p1/claim", body=None)

    assert fake_client.calls, "request was never issued"
    assert fake_client.calls[-1]["json"] == {}


@pytest.mark.asyncio
async def test_explicit_body_passes_through_unchanged(fake_client):
    await mcp._proxy(method="POST", path="/dev/plans/p1/claim", body={"checkpoint_id": "c1"})

    assert fake_client.calls[-1]["json"] == {"checkpoint_id": "c1"}


@pytest.mark.asyncio
async def test_bodyless_get_stays_none(fake_client):
    # GET carries no body; coercion must not invent one.
    await mcp._proxy(method="GET", path="/dev/plans/p1", body=None)

    assert fake_client.calls[-1]["json"] is None
