"""Tests for resolver workbench dev endpoints.

Covers:
  - resolve: valid payload returns ResolutionResult shape with selected blocks + trace
  - resolve: include_candidate_scores emits candidate_scored events
  - resolve: unknown resolver_id returns 400 with informative message
  - compile-template: neither slug nor template_id returns 400
  - compile-template: both slug and template_id returns 400
  - compile-template: slug not found returns 404
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user, get_db
    from pixsim7.backend.main.api.v1.block_templates import router
    from pixsim7.backend.main.domain.user import User

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_user():
    user = MagicMock(spec=User)
    user.id = 1
    user.username = "testuser"
    return user


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _app(db=None):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: _mock_user()
    if db is not None:
        app.dependency_overrides[get_db] = lambda: db
    return app


# A minimal but realistic resolve payload (police aesthetic, desired tag scoring)
_POLICE_RESOLVE_PAYLOAD = {
    "resolver_id": "next_v1",
    "seed": 42,
    "intent": {
        "targets": [
            {"key": "uniform_style", "kind": "slot", "label": "Uniform style", "category": "aesthetic"},
        ],
        "desired_tags_by_target": {
            "uniform_style": {"aesthetic": "police_uniform", "variant": "duty"},
        },
    },
    "candidates_by_target": {
        "uniform_style": [
            {
                "block_id": "police_duty_01",
                "text": "a practical duty police uniform",
                "tags": {"aesthetic": "police_uniform", "variant": "duty"},
                "avg_rating": 3.5,
                "capabilities": ["aesthetic_base"],
            },
            {
                "block_id": "police_sleek_01",
                "text": "a sleek police uniform silhouette",
                "tags": {"aesthetic": "police_uniform", "variant": "sleek"},
                "avg_rating": 4.8,
                "capabilities": ["aesthetic_base"],
            },
        ],
    },
    "constraints": [
        {
            "id": "requires-police-aesthetic",
            "kind": "requires_tag",
            "target_key": "uniform_style",
            "payload": {"tag": "aesthetic", "value": "police_uniform"},
        },
    ],
    "debug": {"include_trace": True, "include_candidate_scores": True},
}


# ---------------------------------------------------------------------------
# resolve endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_returns_valid_result_shape():
    """resolve endpoint returns a valid ResolutionResult shape with selected blocks."""
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=_POLICE_RESOLVE_PAYLOAD,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["resolver_id"] == "next_v1"
    assert "selected_by_target" in data
    assert "uniform_style" in data["selected_by_target"]
    assert isinstance(data["warnings"], list)
    assert isinstance(data["errors"], list)
    assert "trace" in data
    assert isinstance(data["trace"]["events"], list)


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_desired_tag_scoring_selects_correct_block():
    """desired_tags_by_target boosts the matching block over a higher-rated non-match."""
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=_POLICE_RESOLVE_PAYLOAD,
        )
    assert resp.status_code == 200
    selected = resp.json()["selected_by_target"]["uniform_style"]
    # police_duty_01 has both desired tags; police_sleek_01 has higher rating
    # but desired tag bonus (+2.0 per match) outweighs rating delta
    assert selected["block_id"] == "police_duty_01"


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_trace_events_include_scored_and_selected():
    """include_candidate_scores=True emits candidate_scored events plus a selected event."""
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=_POLICE_RESOLVE_PAYLOAD,
        )
    assert resp.status_code == 200
    events = resp.json()["trace"]["events"]
    kinds = {ev["kind"] for ev in events}
    assert "candidate_scored" in kinds
    assert "selected" in kinds


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_forbid_tag_constraint_eliminates_candidate():
    """forbid_tag constraint prunes the matching candidate; resolver picks the survivor."""
    payload = {
        "resolver_id": "next_v1",
        "seed": 1,
        "intent": {
            "targets": [{"key": "modifier", "kind": "slot"}],
        },
        "candidates_by_target": {
            "modifier": [
                {
                    "block_id": "allure_high",
                    "text": "high allure modifier",
                    "tags": {"allure_level": "high"},
                    "capabilities": ["wardrobe_modifier"],
                },
                {
                    "block_id": "allure_subtle",
                    "text": "subtle allure modifier",
                    "tags": {"allure_level": "subtle"},
                    "capabilities": ["wardrobe_modifier"],
                    "avg_rating": 3.0,
                },
            ],
        },
        "constraints": [
            {
                "id": "no-high-allure",
                "kind": "forbid_tag",
                "target_key": "modifier",
                "payload": {"tag": "allure_level", "value": "high"},
            },
        ],
        "debug": {"include_trace": True, "include_candidate_scores": True},
    }
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=payload,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_by_target"]["modifier"]["block_id"] == "allure_subtle"
    events = data["trace"]["events"]
    assert any(ev["kind"] == "constraint_failed" for ev in events)


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_invalid_resolver_id_returns_400():
    """resolve returns HTTP 400 when resolver_id is not in the registry."""
    payload = {**_POLICE_RESOLVE_PAYLOAD, "resolver_id": "ghost_resolver_v99"}
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=payload,
        )
    assert resp.status_code == 400
    assert "ghost_resolver_v99" in resp.text


# ---------------------------------------------------------------------------
# compile-template endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_required_capabilities_filters_candidates():
    """required_capabilities_by_target drops candidates missing the required capability."""
    payload = {
        "resolver_id": "next_v1",
        "seed": 1,
        "intent": {
            "targets": [{"key": "scene", "kind": "slot", "category": "scene_build"}],
            "required_capabilities_by_target": {"scene": ["scene_build"]},
        },
        "candidates_by_target": {
            "scene": [
                {
                    "block_id": "block_wrong_cap",
                    "text": "wrong category block",
                    "capabilities": ["wardrobe_modifier"],
                    "avg_rating": 5.0,
                },
                {
                    "block_id": "block_correct_cap",
                    "text": "correct category block",
                    "capabilities": ["scene_build"],
                    "avg_rating": 3.0,
                },
            ],
        },
        "constraints": [],
        "debug": {"include_trace": True, "include_candidate_scores": True},
    }
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=payload,
        )
    assert resp.status_code == 200
    data = resp.json()
    # Despite block_wrong_cap having a higher rating, it lacks the required capability
    assert data["selected_by_target"]["scene"]["block_id"] == "block_correct_cap"
    events = data["trace"]["events"]
    assert any(
        ev["kind"] == "constraint_failed"
        and ev.get("candidate_block_id") == "block_wrong_cap"
        for ev in events
    )


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_resolve_pairwise_bonus_shifts_selection():
    """pairwise_bonuses in the payload shift selection toward compatible candidate."""
    payload = {
        "resolver_id": "next_v1",
        "seed": 1,
        "intent": {
            "targets": [
                {"key": "base", "kind": "slot"},
                {"key": "modifier", "kind": "slot"},
            ],
        },
        "candidates_by_target": {
            "base": [
                {
                    "block_id": "tribal_base",
                    "text": "tribal base",
                    "tags": {"aesthetic": "tribal"},
                    "avg_rating": 3.0,
                },
            ],
            "modifier": [
                {
                    "block_id": "mod_urban",
                    "text": "urban modifier",
                    "tags": {"style": "urban"},
                    "avg_rating": 4.5,
                },
                {
                    "block_id": "mod_tribal",
                    "text": "tribal modifier",
                    "tags": {"style": "tribal"},
                    "avg_rating": 3.0,
                },
            ],
        },
        "constraints": [],
        "pairwise_bonuses": [
            {
                "id": "tribal-compat",
                "source_target": "base",
                "target_key": "modifier",
                "source_tags": {"aesthetic": "tribal"},
                "candidate_tags": {"style": "tribal"},
                "bonus": 3.0,
            },
        ],
        "debug": {"include_trace": True, "include_candidate_scores": True},
    }
    app = _app()
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/resolve",
            json=payload,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_by_target"]["modifier"]["block_id"] == "mod_tribal"
    events = data["trace"]["events"]
    assert any(ev["kind"] == "pairwise_bonus" for ev in events)


# ---------------------------------------------------------------------------
# Compiler helper unit tests (no HTTP, test enrichment logic directly)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
def test_slot_tag_constraint_groups_emits_all_any_not():
    """_slot_tag_constraint_groups returns all three groups from tag_constraints."""
    from pixsim7.backend.main.api.v1.block_templates import _slot_tag_constraint_groups

    slot = {
        "tag_constraints": {
            "aesthetic": "police_uniform",
            "location": "break_room",
        },
    }
    groups = _slot_tag_constraint_groups(slot)
    assert groups["all"] == {"aesthetic": "police_uniform", "location": "break_room"}
    assert groups["any"] == {}
    assert groups["not"] == {}


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
def test_slot_tag_constraint_groups_handles_tag_query_with_not():
    """_slot_tag_constraint_groups extracts `not` group from tag_query style constraints."""
    from pixsim7.backend.main.api.v1.block_templates import _slot_tag_constraint_groups

    slot = {
        "tags": {
            "all": {"aesthetic": "tribal_handcrafted"},
            "not": {"allure_level": "high"},
        },
    }
    groups = _slot_tag_constraint_groups(slot)
    assert groups["all"] == {"aesthetic": "tribal_handcrafted"}
    assert groups["not"] == {"allure_level": "high"}


# ---------------------------------------------------------------------------
# compile-template endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_compile_template_requires_slug_or_id():
    """compile-template returns 400 when neither slug nor template_id is given."""
    mock_db = AsyncMock()
    app = _app(db=mock_db)
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/compile-template",
            json={"candidate_limit": 10},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_compile_template_rejects_both_slug_and_id():
    """compile-template returns 400 when both slug and template_id are supplied."""
    mock_db = AsyncMock()
    app = _app(db=mock_db)
    async with _client(app) as client:
        resp = await client.post(
            "/api/v1/block-templates/dev/resolver-workbench/compile-template",
            json={"slug": "some-slug", "template_id": str(uuid4())},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="httpx/fastapi not available")
async def test_compile_template_slug_not_found_returns_404():
    """compile-template returns 404 when the slug matches no template in DB."""
    mock_db = AsyncMock()
    with patch(
        "pixsim7.backend.main.api.v1.block_templates.routes_templates.BlockTemplateService"
    ) as MockService:
        mock_svc = MagicMock()
        mock_svc.get_template_by_slug = AsyncMock(return_value=None)
        MockService.return_value = mock_svc
        app = _app(db=mock_db)
        async with _client(app) as client:
            resp = await client.post(
                "/api/v1/block-templates/dev/resolver-workbench/compile-template",
                json={"slug": "nonexistent-template-xyz"},
            )
    assert resp.status_code == 404
    assert "not found" in resp.text.lower()
