"""Phase 4b: per-tab pending agent-question nudge.

`_emit_ask_user_pending` / `_clear_ask_user_pending` fire from the bridge
confirmation gate (ws_chat.py), so the nudge is GENERIC across the PixSim
`ask_user` MCP tool and Claude's harness `AskUserQuestion` — both funnel
through that one gate. Invariants that matter and aren't obvious in
isolation:

* Keyed `ref_type='chat_tab'` / `ref_id=tab_id` (cli_session_id isn't
  reliably known mid-turn; tab_id always is).
* Its own `agent_question` category — NOT `chat` — so muting chat replies
  doesn't also silence "an agent is waiting on you".
* At most one unread nudge per tab: emit clears any prior pending for the
  tab first (collapse-to-one → binary scoped count).
* Best-effort + isolated: no tab_id / no user_id ⇒ silent no-op, no DB.

Same AsyncSessionLocal-stub pattern as ``test_store_session_response.py``.
"""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-ask-user-pending",
    "label": "Notifications Ask-User Pending Nudge",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "notifications-prefs",
    "covers": [
        "pixsim7/backend/main/api/v1/meta_contracts.py:_emit_ask_user_pending",
        "pixsim7/backend/main/api/v1/meta_contracts.py:_clear_ask_user_pending",
    ],
    "order": 27.6,
}

from unittest.mock import AsyncMock, patch

import pytest

try:
    from pixsim7.backend.main.api.v1.meta_contracts import (
        _clear_ask_user_pending,
        _emit_ask_user_pending,
    )
    from pixsim7.backend.main.services.notifications.notification_categories import (
        notification_category_registry,
        notification_event_type_registry,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not IMPORTS_AVAILABLE, reason="backend deps not available"
)


def _patch_db(db_mock):
    class _FakeSessionCtx:
        async def __aenter__(self):
            return db_mock

        async def __aexit__(self, *args):
            return False

    return patch(
        "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
        _FakeSessionCtx,
    )


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    return db


class TestEmitAskUserPending:
    @pytest.mark.asyncio
    async def test_emits_pending_and_collapses_prior(self):
        db = _mock_db()
        with _patch_db(db), patch(
            "pixsim7.backend.main.api.v1.notifications.emit_notification",
            new_callable=AsyncMock,
        ) as emit:
            await _emit_ask_user_pending(
                tab_id="tabA",
                user_id=7,
                title="Need a choice",
                description="pick one",
            )

        # Collapse-to-one UPDATE ran before the insert, and committed.
        db.execute.assert_awaited()  # the prior-pending clear
        db.commit.assert_awaited_once()

        emit.assert_awaited_once()
        kwargs = emit.await_args.kwargs
        assert kwargs["category"] == "agent_question"
        assert kwargs["event_type"] == "ask_user.pending"
        assert kwargs["ref_type"] == "chat_tab"
        assert kwargs["ref_id"] == "tabA"
        assert kwargs["broadcast"] is False
        assert kwargs["user_id"] == 7
        assert kwargs["payload"] == {"tabId": "tabA"}
        assert kwargs["title"] == "Need a choice"

    @pytest.mark.asyncio
    async def test_falls_back_to_default_title(self):
        db = _mock_db()
        with _patch_db(db), patch(
            "pixsim7.backend.main.api.v1.notifications.emit_notification",
            new_callable=AsyncMock,
        ) as emit:
            await _emit_ask_user_pending(tab_id="tabA", user_id=7, title=None)
        assert emit.await_args.kwargs["title"] == "Agent needs your input"

    @pytest.mark.asyncio
    async def test_noop_when_tab_id_missing(self):
        entered = {"v": False}

        class _Boom:
            async def __aenter__(self_):
                entered["v"] = True
                raise AssertionError("DB must not be touched")

            async def __aexit__(self_, *a):
                return False

        with patch(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            _Boom,
        ), patch(
            "pixsim7.backend.main.api.v1.notifications.emit_notification",
            new_callable=AsyncMock,
        ) as emit:
            await _emit_ask_user_pending(tab_id="", user_id=7)
            await _emit_ask_user_pending(tab_id="tabA", user_id=None)

        assert entered["v"] is False
        emit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_swallows_db_errors(self):
        db = _mock_db()
        db.commit = AsyncMock(side_effect=RuntimeError("db down"))
        with _patch_db(db), patch(
            "pixsim7.backend.main.api.v1.notifications.emit_notification",
            new_callable=AsyncMock,
        ):
            # Must not raise — dispatch path can't be disturbed.
            await _emit_ask_user_pending(tab_id="tabA", user_id=7)


class TestClearAskUserPending:
    @pytest.mark.asyncio
    async def test_marks_pending_read(self):
        db = _mock_db()
        with _patch_db(db):
            await _clear_ask_user_pending(tab_id="tabA", user_id=7)
        db.execute.assert_awaited_once()
        db.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_noop_when_args_missing(self):
        entered = {"v": False}

        class _Boom:
            async def __aenter__(self_):
                entered["v"] = True
                raise AssertionError("DB must not be touched")

            async def __aexit__(self_, *a):
                return False

        with patch(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            _Boom,
        ):
            await _clear_ask_user_pending(tab_id="", user_id=7)
            await _clear_ask_user_pending(tab_id="tabA", user_id=None)
        assert entered["v"] is False


class TestRegistry:
    def test_event_type_registered(self):
        spec = notification_event_type_registry.get_or_none("ask_user.pending")
        assert spec is not None
        assert spec.default_category == "agent_question"
        assert spec.default_severity == "warning"
        assert spec.required_ref_type == "chat_tab"

    def test_payload_validation_requires_tab_id(self):
        reg = notification_event_type_registry
        assert reg.validate_payload("ask_user.pending", {}) is not None
        assert reg.validate_payload("ask_user.pending", {"tabId": "t1"}) is None

    def test_agent_question_category_is_bell_suppressed(self):
        spec = notification_category_registry.get_or_none("agent_question")
        assert spec is not None
        # Off the global bell by default, like `chat`; the pip drives it.
        assert spec.default_enabled is False
        assert spec.default_granularity == "off"
