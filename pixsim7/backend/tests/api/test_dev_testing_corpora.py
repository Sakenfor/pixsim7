"""API tests for the eval-corpus endpoints on the dev-testing router.

Exercises GET /dev/testing/corpora and /corpora/{id} through a real
FastAPI/ASGI transport so Query defaults resolve the way they do in
production. The routes are thin wrappers over testing.corpus_discovery,
which has its own unit tests — here we pin the HTTP contract (shape,
filtering, 404, entry preview).
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "dev-testing-corpora-api",
    "label": "Dev-testing corpora endpoints",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "dev-testing-corpora",
    "covers": [
        "pixsim7/backend/main/api/v1/dev_testing.py",
        "testing/corpus_discovery.py",
    ],
    "order": 25.6,
}

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.v1.dev_testing import router

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _app() -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestListCorpora:
    @pytest.mark.asyncio
    async def test_lists_discovered_corpora(self):
        async with _client(_app()) as client:
            resp = await client.get("/api/v1/dev/testing/corpora")
        assert resp.status_code == 200
        body = resp.json()
        assert body["corpus_count"] >= 1
        ids = {c["id"] for c in body["corpora"]}
        assert "primitive-projection" in ids
        # Shape per record.
        sample = body["corpora"][0]
        assert {"id", "label", "path", "category"} <= set(sample)

    @pytest.mark.asyncio
    async def test_category_filter(self):
        async with _client(_app()) as client:
            resp = await client.get(
                "/api/v1/dev/testing/corpora", params={"category": "evals"}
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["corpus_count"] >= 1
        assert all(c["category"].startswith("evals") for c in body["corpora"])

    @pytest.mark.asyncio
    async def test_category_filter_no_match(self):
        async with _client(_app()) as client:
            resp = await client.get(
                "/api/v1/dev/testing/corpora", params={"category": "nonexistent-cat"}
            )
        assert resp.status_code == 200
        assert resp.json()["corpus_count"] == 0


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGetCorpus:
    @pytest.mark.asyncio
    async def test_returns_entries_for_preview(self):
        async with _client(_app()) as client:
            resp = await client.get("/api/v1/dev/testing/corpora/primitive-projection-medium")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "primitive-projection-medium"
        assert body["entry_count"] == len(body["entries"])
        assert body["entry_count"] >= 1
        entry = body["entries"][0]
        assert {"id", "text", "category"} <= set(entry)

    @pytest.mark.asyncio
    async def test_unknown_id_404_lists_known(self):
        async with _client(_app()) as client:
            resp = await client.get("/api/v1/dev/testing/corpora/does-not-exist")
        assert resp.status_code == 404
        detail = resp.json()["detail"]
        assert "primitive-projection" in detail
