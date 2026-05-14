"""Unit tests for the ``_resolve_bridge_client_id`` helper.

Covers the three resolution paths it serves:

* Fresh connect, anonymous → ``shared-XXXX``
* Fresh connect, authenticated → ``user-N-XXXX``
* Reconnect with persisted id, current auth matches → reuse verbatim
* Reconnect with stale ``shared-`` id + new user token → re-mint as user-scoped

The re-mint path is the bug fix from plan
``unified-task-agent-architecture`` (bridge UI scope toggle): once a
client has been issued a ``shared-XXXX`` id, that id sticks across
restarts via ``~/.pixsim/bridge_id`` — without the re-mint the launcher
keeps labeling the bridge as shared even after the user logs in.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "ws-agent-cmd-bridge-id",
    "label": "WS agent-cmd bridge_client_id resolution",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "bridge",
    "covers": [
        "pixsim7/backend/main/api/v1/ws_agent_cmd.py",
    ],
    "order": 27.6,
}

import re

import pytest

from pixsim7.backend.main.api.v1.ws_agent_cmd import _resolve_bridge_client_id


def _is_fresh_user_id(value: str, user_id: int) -> bool:
    return bool(re.fullmatch(rf"user-{user_id}-[0-9a-f]{{8}}", value))


def _is_fresh_shared_id(value: str) -> bool:
    return bool(re.fullmatch(r"shared-[0-9a-f]{8}", value))


def test_fresh_connect_authenticated_mints_user_prefix() -> None:
    out = _resolve_bridge_client_id(None, user_id=7)
    assert _is_fresh_user_id(out, 7)


def test_fresh_connect_anonymous_mints_shared_prefix() -> None:
    out = _resolve_bridge_client_id(None, user_id=None)
    assert _is_fresh_shared_id(out)


@pytest.mark.parametrize("raw", ["", "   ", None])
def test_blank_or_missing_id_treated_as_fresh(raw) -> None:
    out = _resolve_bridge_client_id(raw, user_id=3)
    assert _is_fresh_user_id(out, 3)


def test_reconnect_user_id_with_user_scoped_id_keeps_existing() -> None:
    out = _resolve_bridge_client_id("user-7-abc12345", user_id=7)
    assert out == "user-7-abc12345"


def test_reconnect_anonymous_with_shared_id_keeps_existing() -> None:
    out = _resolve_bridge_client_id("shared-deadbeef", user_id=None)
    assert out == "shared-deadbeef"


def test_reconnect_with_stale_shared_id_now_authenticated_remints_as_user() -> None:
    """The fix: launcher logged in since the bridge first connected →
    server hands back a user-scoped id so the launcher UI stops
    cosmetically labeling the bridge as shared.
    """
    out = _resolve_bridge_client_id("shared-deadbeef", user_id=42)
    assert _is_fresh_user_id(out, 42)
    # And the re-minted id has a fresh suffix, not the stale one.
    assert "deadbeef" not in out


def test_remint_does_not_collide_on_short_uuid_suffix() -> None:
    """Two consecutive remints for the same user produce different ids."""
    a = _resolve_bridge_client_id("shared-abc", user_id=5)
    b = _resolve_bridge_client_id("shared-abc", user_id=5)
    assert a != b


def test_reconnect_keeps_custom_id_when_authenticated() -> None:
    """An id without a ``shared-`` or ``user-`` prefix is treated as opaque.

    Some integration tests / scripts pass arbitrary client ids; the helper
    must reuse them verbatim rather than second-guess the caller.
    """
    out = _resolve_bridge_client_id("dev-fixture-123", user_id=9)
    assert out == "dev-fixture-123"
