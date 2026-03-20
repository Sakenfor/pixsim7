from __future__ import annotations

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_database
    from pixsim7.backend.main.api.v1 import game_links

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


class _FakeDB:
    pass


def _app(db: _FakeDB):
    app = FastAPI()
    app.include_router(game_links.router, prefix="/api/v1/game/links")
    app.dependency_overrides[get_database] = lambda: db
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGameLinksApi:
    def test_get_runtime_kind_normalizes_template_alias(self):
        assert game_links.get_runtime_kind("npc_template") == "npc"

    @pytest.mark.asyncio
    async def test_resolve_template_uses_canonical_runtime_kind(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        db = _FakeDB()
        app = _app(db)

        async def fake_resolver(*_args, **_kwargs):
            return {
                "template_kind": "characterInstance",
                "runtime_kind": "gameNpc",
                "runtime_id": 123,
            }

        monkeypatch.setattr(game_links, "resolve_template_to_runtime_ref", fake_resolver)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/links/resolve",
                json={
                    "template_kind": "npc_template",
                    "template_id": "char-1",
                },
            )

        assert response.status_code == 200
        body = response.json()
        runtime_kind = body.get("runtimeKind", body.get("runtime_kind"))
        runtime_id = body.get("runtimeId", body.get("runtime_id"))
        assert body["resolved"] is True
        assert runtime_kind == "npc"
        assert runtime_id == 123

    @pytest.mark.asyncio
    async def test_resolve_batch_uses_canonical_runtime_kind(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        db = _FakeDB()
        app = _app(db)

        async def fake_resolver(_db, template_kind, template_id, context=None):
            if template_id == "char-1":
                return {
                    "template_kind": "characterInstance",
                    "runtime_kind": "gameNpc",
                    "runtime_id": 456,
                }
            return None

        monkeypatch.setattr(game_links, "resolve_template_to_runtime_ref", fake_resolver)

        async with _client(app) as c:
            response = await c.post(
                "/api/v1/game/links/resolve-batch",
                json={
                    "refs": [
                        {"template_kind": "npc_template", "template_id": "char-1"},
                        {"template_kind": "itemTemplate", "template_id": "missing"},
                    ]
                },
            )

        assert response.status_code == 200
        body = response.json()
        results = body.get("results", {})

        first = results.get("npc_template:char-1", {})
        second = results.get("itemTemplate:missing", {})
        first_kind = first.get("runtimeKind", first.get("runtime_kind"))
        second_kind = second.get("runtimeKind", second.get("runtime_kind"))

        assert first.get("resolved") is True
        assert first_kind == "npc"
        assert second.get("resolved") is False
        assert second_kind is None
