"""Tests for chat session tracking — list, archive, upsert."""
from __future__ import annotations

TEST_SUITE = {
    "id": "chat-sessions-api",
    "label": "Chat Sessions API",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "chat",
    "covers": [
        "pixsim7/backend/main/services/meta/agent_sessions.py",
    ],
    "order": 32,
}

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_current_user_optional,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import meta_contracts

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class _ScalarResult:
    def __init__(self, items):
        self._items = list(items)

    def all(self):
        return list(self._items)


class _ExecuteResult:
    def __init__(self, *, scalars=None):
        self._scalars = list(scalars or [])

    def scalars(self):
        return _ScalarResult(self._scalars)


class _FakeDB:
    def __init__(self):
        self.execute_results = []
        self.get_values = {}
        self.added = []
        self.commit_count = 0

    async def execute(self, _stmt):
        if not self.execute_results:
            return _ExecuteResult(scalars=[])
        return self.execute_results.pop(0)

    async def get(self, model, key):
        return self.get_values.get(key)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commit_count += 1

    async def refresh(self, obj, attribute_names=None):
        # AsyncSession.refresh(instance, attribute_names=None) — accept the
        # optional second positional so callers passing ["messages"] don't
        # blow up the fake. Tests that need to simulate a concurrent PATCH
        # committing during our transaction should monkey-patch this method
        # to mutate `obj` to a "fresher" state before the merge runs.
        return None


def _make_session_obj(
    id: str,
    engine: str = "claude",
    label: str = "test chat",
    message_count: int = 3,
    scope_key: str | None = None,
    last_plan_id: str | None = None,
    last_contract_id: str | None = None,
):
    return SimpleNamespace(
        id=id,
        user_id=1,
        engine=engine,
        profile_id=None,
        scope_key=scope_key,
        last_plan_id=last_plan_id,
        last_contract_id=last_contract_id,
        label=label,
        message_count=message_count,
        # Fields the GET endpoint reads directly on its return path — default
        # them so callers that don't care about identity/transcript recovery
        # don't have to set each one.
        cli_session_id=None,
        icon=None,
        subtitle=None,
        source=None,
        messages=None,
        last_used_at=SimpleNamespace(isoformat=lambda: "2026-03-20T10:00:00"),
        created_at=SimpleNamespace(isoformat=lambda: "2026-03-20T09:00:00"),
        status="active",
    )


def _principal(*, user_id: int = 1, admin: bool = False):
    return SimpleNamespace(
        id=user_id,
        user_id=user_id,
        is_active=True,
        is_admin=lambda: admin,
    )


def _app(db: _FakeDB, *, principal=None):
    app = FastAPI()
    # Router already has prefix="/meta" built in
    app.include_router(meta_contracts.router, prefix="/api/v1")
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_user_optional] = lambda: SimpleNamespace(id=1, is_active=True)
    app.dependency_overrides[get_current_user] = lambda: principal or _principal()
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


class TestListChatSessions:
    """GET /agents/chat-sessions — list with engine filter."""

    @pytest.mark.asyncio
    async def test_list_returns_sessions(self):
        db = _FakeDB()
        s = _make_session_obj(
            "sess-1",
            engine="claude",
            label="hello world",
            scope_key="plan:identity-refactor",
            last_plan_id="identity-refactor",
            last_contract_id="plans.management",
        )
        # First two executes are prune UPDATEs (placeholder + idle mcp-auto),
        # third is the SELECT.
        db.execute_results = [
            _ExecuteResult(scalars=[]),
            _ExecuteResult(scalars=[]),
            _ExecuteResult(scalars=[s]),
        ]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions")

        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data
        assert len(data["sessions"]) == 1
        assert data["sessions"][0]["id"] == "sess-1"
        assert data["sessions"][0]["engine"] == "claude"
        assert data["sessions"][0]["scope_key"] == "plan:identity-refactor"
        assert data["sessions"][0]["last_plan_id"] == "identity-refactor"
        assert data["sessions"][0]["last_contract_id"] == "plans.management"

    @pytest.mark.asyncio
    async def test_list_empty(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions")

        assert r.status_code == 200
        assert r.json()["sessions"] == []

    @pytest.mark.asyncio
    async def test_list_with_engine_filter(self):
        db = _FakeDB()
        s = _make_session_obj("sess-1", engine="codex")
        db.execute_results = [_ExecuteResult(scalars=[s])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions", params={"engine": "codex"})

        assert r.status_code == 200


class TestArchiveChatSession:
    """DELETE /agents/chat-sessions/{id} — archive."""

    @pytest.mark.asyncio
    async def test_archive_existing(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.delete("/api/v1/meta/agents/chat-sessions/sess-1")

        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert session_obj.status == "archived"
        assert db.commit_count == 1

    @pytest.mark.asyncio
    async def test_archive_not_found(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.delete("/api/v1/meta/agents/chat-sessions/nonexistent")

        assert r.status_code == 404


class TestGetChatSession:
    """GET /agents/chat-sessions/{session_id} — single session with messages."""

    @pytest.mark.asyncio
    async def test_get_existing_session(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1", label="hello world")
        session_obj.cli_session_id = "cli-abc"
        session_obj.messages = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00Z"},
            {"role": "assistant", "text": "Hi!", "timestamp": "2026-04-01T00:00:01Z"},
        ]
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/sess-1")

        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "sess-1"
        assert data["label"] == "hello world"
        assert data["messages"] is not None
        assert len(data["messages"]) == 2
        assert data["messages"][0]["role"] == "user"
        assert data["messages"][1]["text"] == "Hi!"

    @pytest.mark.asyncio
    async def test_get_session_with_null_messages(self):
        """Sessions created by CLI/MCP may have messages=null."""
        db = _FakeDB()
        session_obj = _make_session_obj("sess-cli", label="CLI session")
        session_obj.cli_session_id = None
        session_obj.messages = None
        db.get_values["sess-cli"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/sess-cli")

        assert r.status_code == 200
        data = r.json()
        assert data["messages"] is None

    @pytest.mark.asyncio
    async def test_get_recovers_lost_reply_from_cli_transcript(self, monkeypatch):
        """A snapshot frozen on an unanswered user turn is self-healed from
        the CLI transcript: the recovered assistant tail is merged in,
        persisted back, and returned — so the frontend's "check again" works.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1", engine="claude")
        session_obj.cli_session_id = "cli-1"
        session_obj.icon = None
        session_obj.subtitle = None
        session_obj.source = "chat"
        session_obj.messages = [
            {"role": "user", "text": "q1", "timestamp": "2026-06-16T23:20:00+00:00"},
            {"role": "assistant", "text": "a1", "timestamp": "2026-06-16T23:20:05+00:00"},
            {"role": "user", "text": "lost q", "timestamp": "2026-06-16T23:21:00+00:00"},
        ]
        db.get_values["sess-1"] = session_obj

        monkeypatch.setattr(
            meta_contracts,
            "_load_recovered_tail",
            lambda cli_id, snap: [
                {"role": "assistant", "text": "recovered reply",
                 "timestamp": "2026-06-16T23:21:12+00:00"},
            ],
        )

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/sess-1")

        assert r.status_code == 200
        data = r.json()
        texts = [m["text"] for m in data["messages"]]
        assert texts == ["q1", "a1", "lost q", "recovered reply"]
        assert data["message_count"] == 4
        # Reconciled snapshot was persisted back.
        assert db.commit_count == 1
        assert session_obj.messages[-1]["text"] == "recovered reply"

    @pytest.mark.asyncio
    async def test_get_healthy_session_skips_transcript_read(self, monkeypatch):
        """A snapshot already ending on an assistant reply must never touch
        the filesystem — the gate short-circuits before recovery runs."""
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1", engine="claude")
        session_obj.cli_session_id = "cli-1"
        session_obj.icon = None
        session_obj.subtitle = None
        session_obj.source = "chat"
        session_obj.messages = [
            {"role": "user", "text": "q", "timestamp": "2026-06-16T23:20:00+00:00"},
            {"role": "assistant", "text": "a", "timestamp": "2026-06-16T23:20:05+00:00"},
        ]
        db.get_values["sess-1"] = session_obj

        called = {"n": 0}

        def _boom(cli_id, snap):
            called["n"] += 1
            raise AssertionError("recovery should not run for a healthy snapshot")

        monkeypatch.setattr(meta_contracts, "_load_recovered_tail", _boom)

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/sess-1")

        assert r.status_code == 200
        assert called["n"] == 0
        assert db.commit_count == 0

    @pytest.mark.asyncio
    async def test_get_nonexistent_session_returns_404(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/nonexistent")

        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_session_falls_back_to_cli_session_id(self):
        """Resume-by-paste: when the primary-key lookup misses, the
        endpoint must try matching ``cli_session_id`` so a pasted
        Claude/Codex `--resume` hash resolves to its pixsim7 session.
        """
        db = _FakeDB()
        # db.get() returns None (no PK match), then fallback SELECT finds it.
        session_obj = _make_session_obj("sess-pk-id", label="Resume via CLI hash")
        session_obj.cli_session_id = "claude-cli-uuid-abc"
        session_obj.messages = None
        db.execute_results = [_ExecuteResult(scalars=[session_obj])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/chat-sessions/claude-cli-uuid-abc")

        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "sess-pk-id"


class TestSaveChatSessionMessages:
    """PATCH /agents/chat-sessions/{session_id}/messages — persist messages."""

    @pytest.mark.asyncio
    async def test_save_messages(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = None
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        messages = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00Z"},
            {"role": "assistant", "text": "Hi!", "timestamp": "2026-04-01T00:00:01Z"},
        ]
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": messages},
            )

        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["count"] == 2
        assert session_obj.messages == messages
        assert session_obj.message_count == 2
        assert db.commit_count == 1

    @pytest.mark.asyncio
    async def test_save_caps_at_50_messages(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = None
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        messages = [{"role": "user", "text": f"msg-{i}"} for i in range(60)]
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": messages},
            )

        assert r.status_code == 200
        assert r.json()["count"] == 50
        # Should keep the last 50
        assert session_obj.messages[0]["text"] == "msg-10"
        assert session_obj.messages[-1]["text"] == "msg-59"
        assert len(session_obj.messages) == 50

    @pytest.mark.asyncio
    async def test_save_revives_session_stranded_by_placeholder_prune(self):
        """A non-empty persist un-archives + bumps last_used_at.

        Regression: the bridge registers a `CLI session (…)` placeholder with
        message_count=0; a list_chat_sessions call before the first persist
        archives it. The conversation then accumulates real messages here but
        the row used to stay status='archived' forever — invisible to the
        resume picker despite holding the full transcript.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1", label="CLI session (sess-1)")
        session_obj.messages = None
        session_obj.status = "archived"  # stranded by the prune race
        session_obj.last_used_at = SimpleNamespace(isoformat=lambda: "2026-03-20T10:00:00")
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        messages = [
            {"role": "user", "text": "Hello", "timestamp": "2026-04-01T00:00:00Z"},
            {"role": "assistant", "text": "Hi!", "timestamp": "2026-04-01T00:00:01Z"},
        ]
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": messages},
            )

        assert r.status_code == 200
        assert session_obj.status == "active"  # revived
        # last_used_at replaced with a real datetime (was the stub namespace)
        assert not isinstance(session_obj.last_used_at, SimpleNamespace)

    @pytest.mark.asyncio
    async def test_save_empty_list_does_not_revive_archived(self):
        """An empty persist must NOT resurrect a deliberately-archived row."""
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = None
        session_obj.status = "archived"
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": []},
            )

        assert r.status_code == 200
        assert session_obj.status == "archived"  # unchanged

    @pytest.mark.asyncio
    async def test_save_messages_nonexistent_session_returns_404(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/nonexistent/messages",
                json={"messages": []},
            )

        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_save_messages_invalid_body_returns_422(self):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        db.get_values["sess-1"] = session_obj

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": "not a list"},
            )

        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_save_preserves_backend_only_placeholder(self):
        """Regression for session ``b9792a1e``: a server-side abandoned-turn
        placeholder must survive the next debounced ``syncToServer`` PATCH
        even though the client has no idea it exists.

        Pre-fix the PATCH was a destructive overwrite, so a frontend that
        later appended ``"Bridge disconnected"`` would silently erase the
        placeholder when its 2s debounce fired. Post-fix the server merges
        the union and orders by timestamp.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        # State on disk after `_drain_late_result` ran:
        session_obj.messages = [
            {"role": "user", "text": "Q1", "timestamp": "2026-05-10T20:58:00.832Z"},
            {"role": "assistant", "text": "A1", "timestamp": "2026-05-10T21:15:35.129Z"},
            {"role": "user", "text": "Q2", "timestamp": "2026-05-10T21:19:39.585Z"},
            {
                "role": "system",
                "kind": "abandoned",
                "text": "Agent did not respond within 90s — response abandoned.",
                "timestamp": "2026-05-10T21:23:43.000Z",
            },
        ]
        db.get_values["sess-1"] = session_obj

        # What the frontend sends hours later when its bridge poll flips to 0.
        # It never observed the abandoned row — its local store still has 3
        # turns, plus the freshly-appended "Bridge disconnected" system row.
        client_payload = [
            {"role": "user", "text": "Q1", "timestamp": "2026-05-10T20:58:00.832Z"},
            {"role": "assistant", "text": "A1", "timestamp": "2026-05-10T21:15:35.129Z"},
            {"role": "user", "text": "Q2", "timestamp": "2026-05-10T21:19:39.585Z"},
            {"role": "system", "text": "Bridge disconnected", "timestamp": "2026-05-10T23:48:03.023Z"},
        ]

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": client_payload},
            )

        assert r.status_code == 200
        # Both the abandoned placeholder AND the bridge-disconnected row survive,
        # ordered by timestamp.
        texts = [(m["role"], m.get("kind"), m["text"]) for m in session_obj.messages]
        assert texts == [
            ("user", None, "Q1"),
            ("assistant", None, "A1"),
            ("user", None, "Q2"),
            ("system", "abandoned", "Agent did not respond within 90s — response abandoned."),
            ("system", None, "Bridge disconnected"),
        ]
        assert session_obj.message_count == 5
        assert r.json()["count"] == 5

    @pytest.mark.asyncio
    async def test_save_dedupes_across_timestamp_format_skew(self):
        """Regression: the bridge persists with Python ``utcnow().isoformat()``
        (``…+00:00``); the frontend appends with JS ``Date.toISOString()``
        (``…Z``). Same logical reply, different timestamp string formats.
        The merge MUST treat them as one row — otherwise every assistant
        turn lands twice on the server and the frontend reconcile then
        re-pastes them as "recovered" duplicates with amber borders
        (the symptom that hit session ``7303aebc``).
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        # Server state after bridge-side persist — Python-format timestamps.
        session_obj.messages = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00.123456+00:00"},
            {
                "role": "assistant",
                "text": "A",
                "timestamp": "2026-05-12T10:00:05.654321+00:00",
                "duration_ms": 5530,
            },
        ]
        db.get_values["sess-1"] = session_obj

        # Frontend syncing the same conversation — JS-format timestamps.
        client_payload = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00.123Z"},
            {"role": "assistant", "text": "A", "timestamp": "2026-05-12T10:00:05.789Z"},
        ]

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": client_payload},
            )

        assert r.status_code == 200
        # Exactly two rows — no duplicates from format skew.
        assert len(session_obj.messages) == 2
        # Server copies win, so backend-only fields like duration_ms survive.
        assert session_obj.messages[1]["duration_ms"] == 5530

    @pytest.mark.asyncio
    async def test_save_keeps_distinct_system_kinds(self):
        """``kind:"abandoned"`` placeholder is distinct from an ad-hoc
        ``Bridge disconnected`` system notice even when text differs only
        by phrasing — the ``kind`` discriminator keeps them as separate
        rows.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00Z"},
            {
                "role": "system",
                "kind": "abandoned",
                "text": "Agent did not respond within 90s — response abandoned.",
                "timestamp": "2026-05-12T10:04:00Z",
            },
        ]
        db.get_values["sess-1"] = session_obj

        client_payload = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00Z"},
            {"role": "system", "text": "Bridge disconnected", "timestamp": "2026-05-12T12:00:00Z"},
        ]

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": client_payload},
            )

        assert r.status_code == 200
        kinds = [(m["role"], m.get("kind"), m["text"]) for m in session_obj.messages]
        assert kinds == [
            ("user", None, "Q"),
            ("system", "abandoned", "Agent did not respond within 90s — response abandoned."),
            ("system", None, "Bridge disconnected"),
        ]

    @pytest.mark.asyncio
    async def test_save_dedupes_round_tripped_rows(self):
        """Identical (timestamp, role, text) rows are deduped on merge so a
        client re-syncing the same state doesn't double the assistant turn.
        Server copy wins to preserve backend-only fields like ``duration_ms``.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = [
            {"role": "user", "text": "Hi", "timestamp": "2026-05-10T20:00:00Z"},
            {
                "role": "assistant",
                "text": "Hello",
                "timestamp": "2026-05-10T20:00:05Z",
                "duration_ms": 4321,
            },
        ]
        db.get_values["sess-1"] = session_obj

        # Frontend round-trips the same rows (no duration_ms — it doesn't track that).
        client_payload = [
            {"role": "user", "text": "Hi", "timestamp": "2026-05-10T20:00:00Z"},
            {"role": "assistant", "text": "Hello", "timestamp": "2026-05-10T20:00:05Z"},
        ]

        app = _app(db)
        async with _client(app) as c:
            r = await c.patch(
                "/api/v1/meta/agents/chat-sessions/sess-1/messages",
                json={"messages": client_payload},
            )

        assert r.status_code == 200
        assert len(session_obj.messages) == 2
        # Server copy with duration_ms wins.
        assert session_obj.messages[1]["duration_ms"] == 4321


class TestStoreSessionResponseMerges:
    """Regression for the backend-only-writer half of the b9792a1e bug class.

    ``_store_session_response`` is invoked by the bridge / WS handler to
    append the agent's reply to ``ChatSession.messages``. Pre-fix it did a
    direct read-modify-write that clobbered any concurrent frontend PATCH
    landing in the same window. Post-fix it routes through
    ``merge_chat_messages`` and re-fetches before merging so both sides'
    new rows survive.

    These tests stage a "concurrent PATCH" by pre-populating
    ``session.messages`` with rows the store has no knowledge of, then
    asserting they're still present after the store commits.
    """

    @staticmethod
    def _make_async_session_factory(db):
        """Patch target for `AsyncSessionLocal()` — a no-arg callable that
        returns an async context manager yielding `db`."""

        class _Ctx:
            async def __aenter__(self):
                return db

            async def __aexit__(self, *args):
                return None

        return lambda: _Ctx()

    @pytest.mark.asyncio
    async def test_preserves_concurrent_patch_rows(self, monkeypatch):
        """Frontend PATCHed a "Bridge disconnected" system row between the
        bridge's task dispatch and the reply arriving. The store must keep
        that row, not overwrite it.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        # State on disk at the moment _store_session_response runs — note
        # the "Bridge disconnected" row was added by a frontend PATCH that
        # raced with the bridge's reply persist.
        session_obj.messages = [
            {"role": "user", "text": "Hi", "timestamp": "2026-05-12T10:00:00Z"},
            {"role": "system", "text": "Bridge disconnected", "timestamp": "2026-05-12T10:00:02Z"},
        ]
        db.get_values["sess-1"] = session_obj

        factory = self._make_async_session_factory(db)
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            factory,
        )

        await meta_contracts._store_session_response(
            session_id="sess-1",
            user_message="Hi",
            assistant_response="Hello there",
            duration_ms=2150,
        )

        texts = [(m["role"], m.get("kind"), m["text"]) for m in session_obj.messages]
        # The user "Hi" already on the row dedupes with the one we appended;
        # the bridge-disconnected row survives; the assistant reply lands.
        assert ("user", None, "Hi") in texts
        assert ("system", None, "Bridge disconnected") in texts
        assert ("assistant", None, "Hello there") in texts
        # And the assistant row carries the duration_ms we passed in.
        asst = next(m for m in session_obj.messages if m["role"] == "assistant")
        assert asst["duration_ms"] == 2150

    @pytest.mark.asyncio
    async def test_dedupes_re_entry_same_response(self, monkeypatch):
        """Bridge `resolve_task` + the legacy WS-handler call site can both
        invoke `_store_session_response` for the same reply. The merge's
        (role, stripped-text, kind) identity must collapse them to one row
        instead of appending twice.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        # First call already landed.
        session_obj.messages = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00Z"},
            {"role": "assistant", "text": "A", "timestamp": "2026-05-12T10:00:05Z", "duration_ms": 1000},
        ]
        db.get_values["sess-1"] = session_obj

        factory = self._make_async_session_factory(db)
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            factory,
        )

        # Second invocation with identical content.
        await meta_contracts._store_session_response(
            session_id="sess-1",
            user_message="Q",
            assistant_response="A",
            duration_ms=1000,
        )

        # Still exactly two rows — no duplicate user or assistant turn.
        roles = [m["role"] for m in session_obj.messages]
        assert roles == ["user", "assistant"]
        # The server-side row (with duration_ms set first) won the merge.
        assert session_obj.messages[1]["duration_ms"] == 1000

    @pytest.mark.asyncio
    async def test_picks_up_refresh_in_concurrent_write_window(self, monkeypatch):
        """A frontend PATCH commits between our initial fetch and our merge.
        `db.refresh(session, ["messages"])` is supposed to re-read the row
        so the merge sees the fresher state. This stages that by having
        `refresh` mutate `session.messages` to a "fresher" version.
        """
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        # State at the moment of `db.get` — the frontend hasn't synced yet.
        session_obj.messages = [
            {"role": "user", "text": "Q", "timestamp": "2026-05-12T10:00:00Z"},
        ]
        db.get_values["sess-1"] = session_obj

        # Simulate a concurrent frontend PATCH committing during our txn —
        # `refresh` should observe the newer state.
        concurrent_patch_row = {
            "role": "user", "text": "Q2 (sent fast)", "timestamp": "2026-05-12T10:00:03Z",
        }

        async def _faking_refresh(obj, attribute_names=None):
            obj.messages = list(obj.messages) + [concurrent_patch_row]

        db.refresh = _faking_refresh

        factory = self._make_async_session_factory(db)
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            factory,
        )

        await meta_contracts._store_session_response(
            session_id="sess-1",
            user_message="Q",
            assistant_response="A",
        )

        texts = [m["text"] for m in session_obj.messages]
        # The "Q2 (sent fast)" row that arrived between get and merge MUST
        # be in the final state — that's the whole point of `refresh` before merge.
        assert "Q2 (sent fast)" in texts
        assert "A" in texts


class TestStorePendingUserMessage:
    """`_store_pending_user_message` — durability CP-A.

    The user turn is persisted at dispatch, before any assistant reply, so
    an interrupted turn (bridge/MCP drop, timeout) still shows the unanswered
    user turn server-side instead of vanishing into client-only localStorage.
    Pinned in isolation because it's otherwise only exercised transitively
    through the WS handler.
    """

    @staticmethod
    def _make_async_session_factory(db):
        class _Ctx:
            async def __aenter__(self):
                return db

            async def __aexit__(self, *args):
                return None

        return lambda: _Ctx()

    @pytest.mark.asyncio
    async def test_persists_user_turn_before_any_reply(self, monkeypatch):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = []
        db.get_values["sess-1"] = session_obj

        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            self._make_async_session_factory(db),
        )

        await meta_contracts._store_pending_user_message(
            session_id="sess-1",
            user_message="my interrupted question",
        )

        assert db.commit_count == 1
        rows = [(m["role"], m["text"]) for m in session_obj.messages]
        assert ("user", "my interrupted question") in rows

    @pytest.mark.asyncio
    async def test_empty_message_is_noop(self, monkeypatch):
        db = _FakeDB()
        session_obj = _make_session_obj("sess-1")
        session_obj.messages = []
        db.get_values["sess-1"] = session_obj

        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            self._make_async_session_factory(db),
        )

        await meta_contracts._store_pending_user_message(
            session_id="sess-1",
            user_message="",
        )

        assert db.commit_count == 0
        assert session_obj.messages == []

    @pytest.mark.asyncio
    async def test_resolves_session_by_cli_session_id_fallback(self, monkeypatch):
        """PK lookup misses (id is a bridge handle), but the row exists keyed
        by ``cli_session_id`` — the fallback SELECT must find it so the user
        turn still lands on the right session."""
        db = _FakeDB()
        session_obj = _make_session_obj("real-pk")
        session_obj.messages = []
        # db.get(ChatSession, "bridge-handle") → None; fallback SELECT hits.
        db.execute_results = [_ExecuteResult(scalars=[session_obj])]

        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            self._make_async_session_factory(db),
        )

        await meta_contracts._store_pending_user_message(
            session_id="bridge-handle",
            user_message="routed by cli_session_id",
        )

        assert db.commit_count == 1
        rows = [(m["role"], m["text"]) for m in session_obj.messages]
        assert ("user", "routed by cli_session_id") in rows

    @pytest.mark.asyncio
    async def test_archived_session_is_skipped(self, monkeypatch):
        db = _FakeDB()
        archived = _make_session_obj("sess-archived")
        archived.status = "archived"
        archived.messages = []
        db.get_values["sess-archived"] = archived

        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            self._make_async_session_factory(db),
        )

        await meta_contracts._store_pending_user_message(
            session_id="sess-archived",
            user_message="should not land",
        )

        assert db.commit_count == 0
        assert archived.messages == []


class TestArchivedSessionWriteGuards:
    """User-archived sessions must not receive background writes.

    Pre-2026-05 the upsert and message-append writers had no `status` gate,
    so heartbeats / late-arriving bridge replies / drain placeholders kept
    bumping `last_used_at` and even appending messages to archived rows.
    The list endpoint filters by status so they didn't reappear, but the
    data drift was real (and confusing when un-archiving via /restore).

    These tests pin: an archived row is read-only to background writes
    until `/restore` un-archives it.
    """

    @staticmethod
    def _make_async_session_factory(db):
        class _Ctx:
            async def __aenter__(self):
                return db

            async def __aexit__(self, *args):
                return None

        return lambda: _Ctx()

    @pytest.mark.asyncio
    async def test_upsert_skips_archived_session(self, monkeypatch):
        """`_upsert_chat_session` on an archived row must not mutate it."""
        db = _FakeDB()
        archived = _make_session_obj("sess-archived")
        archived.status = "archived"
        archived.message_count = 7
        original_last_used_at = archived.last_used_at
        original_label = archived.label
        db.get_values["sess-archived"] = archived

        factory = self._make_async_session_factory(db)
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            factory,
        )

        await meta_contracts._upsert_chat_session(
            session_id="sess-archived",
            user_id=1,
            engine="claude",
            label="new-label-attempt",
            profile_id="profile-x",
            scope_key="plan:something",
            last_plan_id="something",
            source="mcp",
            increment_messages=True,
        )

        assert archived.status == "archived"  # unchanged
        assert archived.message_count == 7    # not incremented
        assert archived.last_used_at is original_last_used_at  # not bumped
        assert archived.label == original_label  # not overwritten
        assert db.commit_count == 0           # no commit fired

    @pytest.mark.asyncio
    async def test_store_session_response_skips_archived_session(self, monkeypatch):
        """Bridge-side reply persist must not append to an archived row."""
        db = _FakeDB()
        archived = _make_session_obj("sess-archived")
        archived.status = "archived"
        archived.messages = [
            {"role": "user", "text": "old", "timestamp": "2026-05-12T10:00:00Z"},
        ]
        original_messages = list(archived.messages)
        original_last_used_at = archived.last_used_at
        db.get_values["sess-archived"] = archived

        factory = self._make_async_session_factory(db)
        monkeypatch.setattr(
            "pixsim7.backend.main.infrastructure.database.session.AsyncSessionLocal",
            factory,
        )

        await meta_contracts._store_session_response(
            session_id="sess-archived",
            user_message="new user message",
            assistant_response="new agent reply",
            duration_ms=500,
        )

        assert archived.messages == original_messages  # not appended to
        assert archived.last_used_at is original_last_used_at  # not bumped
        assert db.commit_count == 0


class TestActiveTask:
    """GET /agents/bridge/active-task."""

    @pytest.mark.asyncio
    async def test_returns_idle_when_no_bridge(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/active-task")

        assert r.status_code == 200
        assert r.json()["status"] == "idle"


class TestTaskResult:
    """GET /agents/bridge/task-result/{task_id}."""

    @pytest.mark.asyncio
    async def test_not_found(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/task-result/nonexistent")

        assert r.status_code == 200
        assert r.json()["status"] == "not_found"


class TestBridgeMachines:
    """GET /agents/bridge/machines."""

    @pytest.mark.asyncio
    async def test_returns_known_machine_rows(self):
        db = _FakeDB()
        row = SimpleNamespace(
            bridge_client_id="machine-a",
            bridge_id="9a4ff4f3-6421-4e76-bc1d-1f91264a9d12",
            agent_type="claude",
            status="offline",
            first_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-20T08:00:00"),
            last_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:30:00"),
            last_connected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:00:00"),
            last_disconnected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:30:00"),
            meta={"model": "claude-3.7-sonnet", "client_host": "127.0.0.1"},
        )
        db.execute_results = [_ExecuteResult(scalars=[row])]

        app = _app(db)
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines")

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["machines"][0]["bridge_client_id"] == "machine-a"
        assert data["machines"][0]["status"] == "offline"
        assert data["machines"][0]["online"] is False
        assert data["machines"][0]["model"] == "claude-3.7-sonnet"
        assert data["machines"][0]["client_host"] == "127.0.0.1"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_memberships(self):
        db = _FakeDB()
        app = _app(db)

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines")

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["machines"] == []

    @pytest.mark.asyncio
    async def test_admin_can_query_other_user_machines(self):
        db = _FakeDB()
        row = SimpleNamespace(
            bridge_client_id="machine-user-42",
            bridge_id="11111111-1111-1111-1111-111111111111",
            agent_type="codex",
            status="online",
            first_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-22T08:00:00"),
            last_seen_at=SimpleNamespace(isoformat=lambda: "2026-03-23T10:00:00"),
            last_connected_at=SimpleNamespace(isoformat=lambda: "2026-03-23T09:59:00"),
            last_disconnected_at=None,
            meta={"model": "gpt-5.2", "client_host": "10.0.0.42"},
        )
        db.execute_results = [_ExecuteResult(scalars=[row])]

        app = _app(db, principal=_principal(user_id=1, admin=True))
        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines", params={"user_id": 42})

        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["machines"][0]["bridge_client_id"] == "machine-user-42"
        assert data["machines"][0]["online"] is True

    @pytest.mark.asyncio
    async def test_non_admin_cannot_query_other_user_machines(self):
        db = _FakeDB()
        app = _app(db, principal=_principal(user_id=1, admin=False))

        async with _client(app) as c:
            r = await c.get("/api/v1/meta/agents/bridge/machines", params={"user_id": 42})

        assert r.status_code == 403
