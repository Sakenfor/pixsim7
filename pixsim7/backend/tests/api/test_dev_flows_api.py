"""
API tests for Journey Flow Mapping v1 endpoints.

Tests:
- /dev/flows/graph returns a contract-valid payload
- /dev/flows/resolve returns deterministic ordering
- /dev/flows/resolve returns blocked reasons for missing context
"""

from __future__ import annotations

import sqlite3
from unittest.mock import MagicMock

import pytest

try:
    import httpx
    from fastapi import FastAPI
    from pixsim7.backend.main.api.dependencies import (
        get_current_user_optional,
        get_database,
    )
    from pixsim7.backend.main.api.v1 import dev_flows as dev_flows_module
    from pixsim7.backend.main.api.v1.dev_flows import router
    from pixsim7.backend.main.api.v1.dev_flows_contract import (
        FlowGraphV1,
        FlowResolveResponse,
        FlowTemplate,
        FlowTraceResponse,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not IMPORTS_AVAILABLE, reason="Backend dependencies not installed"
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def _reset_flow_trace_state():
    dev_flows_module._reset_trace_state_for_tests()
    yield
    dev_flows_module._reset_trace_state_for_tests()


def _app() -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield MagicMock()

    async def _no_user():
        return MagicMock()

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_user_optional] = _no_user
    return app


def _without_generated_at(payload: dict) -> dict:
    data = dict(payload)
    data.pop("generated_at", None)
    return data


def _seed_templates() -> list[FlowTemplate]:
    rows = [
        {
            "id": "character.create.basic",
            "label": "Character Create (Basic)",
            "domain": "character",
            "start_node_id": "character_creator_panel",
            "tags": ["starter", "character", "creation"],
            "nodes": [
                {
                    "id": "character_creator_panel",
                    "kind": "panel",
                    "label": "Character Creator",
                    "ref": "character_creator",
                },
                {
                    "id": "character_assets_step",
                    "kind": "action",
                    "label": "Portrait and Assets",
                    "ref": "character_assets",
                },
                {
                    "id": "character_roles_bindings_step",
                    "kind": "action",
                    "label": "Roles and Bindings",
                    "ref": "roles_bindings",
                },
                {
                    "id": "character_ready_gate",
                    "kind": "gate",
                    "label": "Character Ready",
                    "ref": "character_ready",
                },
            ],
            "edges": [
                {
                    "id": "character_creator_to_assets",
                    "from": "character_creator_panel",
                    "to": "character_assets_step",
                },
                {
                    "id": "character_assets_to_roles",
                    "from": "character_assets_step",
                    "to": "character_roles_bindings_step",
                },
                {
                    "id": "character_roles_to_ready",
                    "from": "character_roles_bindings_step",
                    "to": "character_ready_gate",
                },
            ],
        },
        {
            "id": "scene.create.from_scene_prep",
            "label": "Scene Create from Scene Prep",
            "domain": "scene",
            "start_node_id": "scene_prep_panel",
            "tags": ["starter", "scene", "scene_prep"],
            "nodes": [
                {
                    "id": "scene_prep_panel",
                    "kind": "panel",
                    "label": "Scene Prep",
                    "ref": "scene_prep",
                },
                {
                    "id": "scene_generation_action",
                    "kind": "action",
                    "label": "Generation",
                    "ref": "scene_generation",
                },
                {
                    "id": "scene_output_selection",
                    "kind": "action",
                    "label": "Select Outputs",
                    "ref": "scene_outputs",
                },
                {
                    "id": "scene_create_api",
                    "kind": "api",
                    "label": "Create or Update GameScene",
                    "ref": "/api/v1/game-scenes",
                },
            ],
            "edges": [
                {
                    "id": "scene_prep_to_generation",
                    "from": "scene_prep_panel",
                    "to": "scene_generation_action",
                    "condition": "requires_world",
                    "on_fail_reason": "Select a world before running scene generation.",
                },
                {
                    "id": "scene_generation_to_selection",
                    "from": "scene_generation_action",
                    "to": "scene_output_selection",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for this step.",
                },
                {
                    "id": "scene_selection_to_create",
                    "from": "scene_output_selection",
                    "to": "scene_create_api",
                    "condition": "requires_location",
                    "on_fail_reason": "Choose a location before creating a scene.",
                },
            ],
        },
        {
            "id": "scene.create.from_room_nav",
            "label": "Scene Create from Room Navigation",
            "domain": "scene",
            "start_node_id": "room_navigation_panel",
            "tags": ["starter", "scene", "room_navigation"],
            "nodes": [
                {
                    "id": "room_navigation_panel",
                    "kind": "panel",
                    "label": "GameWorld Room Navigation",
                    "ref": "room_navigation",
                },
                {
                    "id": "checkpoint_traversal_step",
                    "kind": "action",
                    "label": "Checkpoint Traversal",
                    "ref": "checkpoint_traversal",
                },
                {
                    "id": "scene_plan_step",
                    "kind": "action",
                    "label": "Scene Plan",
                    "ref": "scene_plan",
                },
                {
                    "id": "room_nav_generation_step",
                    "kind": "api",
                    "label": "Generation",
                    "ref": "/api/v1/generations",
                },
                {
                    "id": "room_nav_scene_create_step",
                    "kind": "api",
                    "label": "Create Scene",
                    "ref": "/api/v1/game-scenes",
                },
            ],
            "edges": [
                {
                    "id": "room_nav_to_checkpoint",
                    "from": "room_navigation_panel",
                    "to": "checkpoint_traversal_step",
                    "condition": "requires_room_navigation",
                    "on_fail_reason": "Room navigation must be enabled for this flow.",
                },
                {
                    "id": "checkpoint_to_scene_plan",
                    "from": "checkpoint_traversal_step",
                    "to": "scene_plan_step",
                    "condition": "requires_location",
                    "on_fail_reason": "A location is needed to build a scene plan.",
                },
                {
                    "id": "scene_plan_to_generation",
                    "from": "scene_plan_step",
                    "to": "room_nav_generation_step",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for this step.",
                },
                {
                    "id": "room_nav_generation_to_scene_create",
                    "from": "room_nav_generation_step",
                    "to": "room_nav_scene_create_step",
                    "condition": "requires_world",
                    "on_fail_reason": "Select a world before creating a scene.",
                },
            ],
        },
        {
            "id": "asset.generate.quick",
            "label": "Quick Asset Generation",
            "domain": "generation",
            "start_node_id": "quickgen_prompt_panel",
            "tags": ["starter", "asset", "quickgen"],
            "nodes": [
                {
                    "id": "quickgen_prompt_panel",
                    "kind": "panel",
                    "label": "QuickGen Prompt and Settings",
                    "ref": "quickgen",
                },
                {
                    "id": "quickgen_generate_action",
                    "kind": "action",
                    "label": "Generate",
                    "ref": "quickgen_generate",
                },
                {
                    "id": "quickgen_gallery_panel",
                    "kind": "panel",
                    "label": "Gallery",
                    "ref": "asset_gallery",
                },
                {
                    "id": "quickgen_reuse_action",
                    "kind": "action",
                    "label": "Reuse Asset",
                    "ref": "asset_reuse",
                },
            ],
            "edges": [
                {
                    "id": "quickgen_prompt_to_generate",
                    "from": "quickgen_prompt_panel",
                    "to": "quickgen_generate_action",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for quick generation.",
                },
                {
                    "id": "quickgen_generate_to_gallery",
                    "from": "quickgen_generate_action",
                    "to": "quickgen_gallery_panel",
                },
                {
                    "id": "quickgen_gallery_to_reuse",
                    "from": "quickgen_gallery_panel",
                    "to": "quickgen_reuse_action",
                },
            ],
        },
    ]
    return [FlowTemplate.model_validate(row) for row in rows]


@pytest.fixture(autouse=True)
def _stub_flow_templates(monkeypatch: pytest.MonkeyPatch):
    async def _list_templates(*, db, user):
        _ = db
        _ = user
        return [template.model_copy(deep=True) for template in _seed_templates()]

    monkeypatch.setattr(dev_flows_module, "_list_flow_templates", _list_templates)


@pytest.mark.anyio
async def test_graph_returns_valid_schema():
    app = _app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/api/v1/dev/flows/graph")

    assert res.status_code == 200
    data = res.json()

    assert data["version"] == "1.0.0"
    assert isinstance(data["templates"], list)
    assert isinstance(data["runs"], list)
    assert data["metrics"]["total_templates"] == len(data["templates"])
    assert data["metrics"]["total_runs"] == len(data["runs"])
    assert data["metrics"]["blocked_edges_24h"] == 0
    assert len(data["templates"]) >= 4
    template_ids = [template["id"] for template in data["templates"]]
    assert template_ids == sorted(template_ids)

    model = FlowGraphV1.model_validate(data)
    assert model.version == "1.0.0"


@pytest.mark.anyio
async def test_resolve_is_deterministic_with_complete_context():
    app = _app()
    payload = {
        "goal": "scene.create",
        "context": {
            "world_id": "world-1",
            "location_id": "loc-1",
            "capabilities": ["scene_prep", "generation"],
            "flags": ["room_navigation_enabled"],
        },
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        first = await client.post("/api/v1/dev/flows/resolve", json=payload)
        second = await client.post("/api/v1/dev/flows/resolve", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200

    first_data = first.json()
    second_data = second.json()

    assert _without_generated_at(first_data) == _without_generated_at(second_data)
    assert [item["template_id"] for item in first_data["candidate_templates"]] == [
        "scene.create.from_room_nav",
        "scene.create.from_scene_prep",
    ]
    assert [item["id"] for item in first_data["candidate_templates"]] == [
        "candidate:scene.create.from_room_nav",
        "candidate:scene.create.from_scene_prep",
    ]
    assert all(item["kind"] == "candidate_template" for item in first_data["candidate_templates"])
    assert [item["status"] for item in first_data["candidate_templates"]] == [
        "ready",
        "ready",
    ]
    assert first_data["blocked_steps"] == []
    assert all(item["id"].startswith("step:") for item in first_data["next_steps"])
    assert [item["node_id"] for item in first_data["next_steps"]] == [
        "checkpoint_traversal_step",
        "scene_generation_action",
    ]
    assert first_data["suggested_path"]["id"].startswith("path:")
    assert first_data["suggested_path"]["kind"] == "suggested_path"

    model = FlowResolveResponse.model_validate(first_data)
    assert model.goal == "scene.create"


@pytest.mark.anyio
async def test_resolve_returns_blocked_reasons_when_context_missing():
    app = _app()
    payload = {
        "goal": "scene.create",
        "context": {
            "capabilities": [],
            "flags": [],
        },
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post("/api/v1/dev/flows/resolve", json=payload)

    assert res.status_code == 200
    data = res.json()

    assert data["next_steps"] == []
    reason_codes = {step["reason_code"] for step in data["blocked_steps"]}
    assert "missing_world" in reason_codes
    assert "room_navigation_not_enabled" in reason_codes
    assert all(step["kind"] == "blocked_step" for step in data["blocked_steps"])
    assert all(step["id"].startswith("blocked:") for step in data["blocked_steps"])
    assert all(item["status"] == "blocked" for item in data["candidate_templates"])
    assert all(item["reason_code"] for item in data["candidate_templates"])
    assert all(item["reason"] for item in data["candidate_templates"])
    assert data["suggested_path"]["blocked"] is True
    assert data["suggested_path"]["reason_code"] in reason_codes
    assert data["suggested_path"]["kind"] == "suggested_path"
    assert data["suggested_path"]["blocked_reason_code"] in reason_codes


@pytest.mark.anyio
async def test_trace_events_surface_in_graph_metrics_and_runs():
    app = _app()
    payload_start = {
        "template_id": "scene.create.from_scene_prep",
        "run_id": "run_trace_001",
        "node_id": "scene_prep_panel",
        "status": "in_progress",
    }
    payload_blocked = {
        "template_id": "scene.create.from_scene_prep",
        "run_id": "run_trace_001",
        "node_id": "scene_generation_action",
        "status": "blocked",
        "reason_code": "missing_world",
        "reason": "Select a world before running scene generation.",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        start_res = await client.post("/api/v1/dev/flows/trace", json=payload_start)
        blocked_res = await client.post("/api/v1/dev/flows/trace", json=payload_blocked)
        graph_res = await client.get("/api/v1/dev/flows/graph")

    assert start_res.status_code == 200
    assert blocked_res.status_code == 200
    assert graph_res.status_code == 200

    start_data = start_res.json()
    blocked_data = blocked_res.json()
    graph_data = graph_res.json()

    start_model = FlowTraceResponse.model_validate(start_data)
    blocked_model = FlowTraceResponse.model_validate(blocked_data)
    assert start_model.accepted is True
    assert blocked_model.run_id == "run_trace_001"
    assert blocked_model.run_summary.status == "blocked"
    assert blocked_model.run_summary.last_node_id == "scene_generation_action"

    assert graph_data["metrics"]["total_runs"] >= 1
    assert graph_data["metrics"]["blocked_edges_24h"] >= 1
    run_entries = [run for run in graph_data["runs"] if run["template_id"] == "scene.create.from_scene_prep"]
    assert run_entries
    latest = run_entries[-1]
    assert latest["status"] == "blocked"
    assert latest["last_node_id"] == "scene_generation_action"


@pytest.mark.anyio
async def test_trace_events_are_persisted_in_sqlite_sink():
    app = _app()
    payload = {
        "template_id": "character.create.basic",
        "run_id": "run_trace_sqlite_001",
        "node_id": "character_assets_step",
        "status": "in_progress",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post("/api/v1/dev/flows/trace", json=payload)

    assert res.status_code == 200

    trace_db_path = dev_flows_module._TRACE_DB_PATH
    assert trace_db_path.exists()
    with sqlite3.connect(trace_db_path) as conn:
        row = conn.execute(
            """
            SELECT template_id, run_id, node_id, status
            FROM flow_trace_events
            WHERE run_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("run_trace_sqlite_001",),
        ).fetchone()

    assert row is not None
    assert row[0] == "character.create.basic"
    assert row[1] == "run_trace_sqlite_001"
    assert row[2] == "character_assets_step"
    assert row[3] == "in_progress"
