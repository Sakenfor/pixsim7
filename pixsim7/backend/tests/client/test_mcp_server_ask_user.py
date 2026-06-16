"""Tests for ``_handle_ask_user`` — the MCP ``ask_user`` response interpreter.

Plan: ``agent-confirmation-hooks``.

Covers how ``_handle_ask_user`` turns the hook ``/confirm`` response dict into
the text the agent sees. The important guard: a ``choice`` prompt the user
answers with *free text* (the "Other" escape hatch — no choice id returned)
must surface that text, not collapse to an empty ``User selected: (id: )``.
The transport already carries ``text`` end-to-end (bridge stores it for every
response); this is the final interpretation step that must honour it.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-mcp-server-ask-user",
    "label": "MCP ask_user response interpretation",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/mcp_server.py",
    ],
    "order": 19.2,
}

import pytest

from pixsim7.client import mcp_server


class _FakeResponse:
    def __init__(self, payload: dict):
        self.status_code = 200
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    """Minimal stand-in for ``httpx.AsyncClient`` returning a canned /confirm body."""

    def __init__(self, payload: dict):
        self._payload = payload

    def __call__(self, *_args, **_kwargs):  # AsyncClient(timeout=...)
        return self

    async def post(self, _url, json=None):  # noqa: A002 - mirrors httpx signature
        return _FakeResponse(self._payload)

    async def aclose(self) -> None:
        return None


@pytest.fixture(autouse=True)
def _hook_port(monkeypatch):
    monkeypatch.setattr(mcp_server, "_get_hook_port", lambda: 12345)


def _patch_confirm(monkeypatch, payload: dict) -> None:
    fake = _FakeAsyncClient(payload)
    monkeypatch.setattr(mcp_server.httpx, "AsyncClient", fake)


async def _ask(arguments: dict) -> str:
    out = await mcp_server._handle_ask_user(arguments)
    return out[0].text


class TestHandleAskUser:

    @pytest.mark.anyio
    async def test_choice_with_matching_id_reports_label(self, monkeypatch):
        _patch_confirm(monkeypatch, {"approved": True, "choice": "a"})
        text = await _ask({
            "interaction_type": "choice",
            "choices": [{"id": "a", "label": "Option A"}],
        })
        assert text == "User selected: Option A (id: a)"

    @pytest.mark.anyio
    async def test_choice_with_freeform_text_surfaces_custom_answer(self, monkeypatch):
        # The "Other" escape hatch: no choice id, free text instead.
        _patch_confirm(monkeypatch, {"approved": True, "choice": "", "text": "do it my way"})
        text = await _ask({
            "interaction_type": "choice",
            "choices": [{"id": "a", "label": "Option A"}],
        })
        assert text == "User responded (custom): do it my way"

    @pytest.mark.anyio
    async def test_choice_id_wins_over_text_when_both_present(self, monkeypatch):
        # A real selection still reports the selection, even if text tags along.
        _patch_confirm(monkeypatch, {"approved": True, "choice": "a", "text": "ignored"})
        text = await _ask({
            "interaction_type": "choice",
            "choices": [{"id": "a", "label": "Option A"}],
        })
        assert text == "User selected: Option A (id: a)"

    @pytest.mark.anyio
    async def test_text_input_reports_response(self, monkeypatch):
        _patch_confirm(monkeypatch, {"approved": True, "text": "hello"})
        text = await _ask({"interaction_type": "text_input"})
        assert text == "User responded: hello"

    @pytest.mark.anyio
    async def test_declined_prompt(self, monkeypatch):
        _patch_confirm(monkeypatch, {"approved": False})
        text = await _ask({"interaction_type": "choice"})
        assert "declined" in text.lower()
