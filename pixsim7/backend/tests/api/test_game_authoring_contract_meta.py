"""Game authoring contract metadata endpoint tests."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.game_meta as game_meta_module
from pixsim7.backend.main.api.v1.game_meta import (
    GAME_AUTHORING_CONTRACT_VERSION,
    get_game_authoring_contract,
)


def _user() -> SimpleNamespace:
    return SimpleNamespace(id=7, username="alice")


@pytest.mark.asyncio
async def test_game_authoring_contract_exposes_core_workflows_and_profiles() -> None:
    result = await get_game_authoring_contract(current_user=_user())

    assert result.version == GAME_AUTHORING_CONTRACT_VERSION
    assert result.endpoint == "/api/v1/game/meta/authoring-contract"

    endpoint_ids = {endpoint.id for endpoint in result.endpoints}
    assert {
        "game.worlds.create",
        "game.worlds.update_meta",
        "game.objects.create",
        "game.objects.put",
        "game.locations.npc_slots.put",
        "game.locations.room_navigation.patch",
        "game.locations.room_navigation.validate",
        "game.locations.room_navigation.transition_cache.put",
        "game.behavior.validate",
        "game.projects.save_snapshot",
        "game.sessions.create",
        "blocks.content_packs",
    } <= endpoint_ids

    workflow_ids = {workflow.id for workflow in result.workflows}
    assert {
        "quick_world_bootstrap",
        "room_navigation_iteration_loop",
        "object_authoring_loop",
        "snapshot_iteration_loop",
        "import_and_playtest",
    } <= workflow_ids

    bananza = next(profile for profile in result.seed_profiles if profile.id == "bananza_boat_slice_v1")
    assert bananza.defaults["world_name"] == "Bananza Boat"
    assert bananza.defaults["project_name"] == "Bananza Boat Seed Project"
    assert "scripts.seeds.game.bananza.cli" in bananza.cli_example


@pytest.mark.asyncio
async def test_game_authoring_contract_filters_by_audience() -> None:
    result = await get_game_authoring_contract(current_user=_user(), audience="agent")

    assert result.workflows
    assert all("agent" in workflow.audience for workflow in result.workflows)
    assert result.seed_profiles
    assert all("agent" in profile.audience for profile in result.seed_profiles)


@pytest.mark.asyncio
async def test_game_authoring_contract_rejects_invalid_audience() -> None:
    with pytest.raises(HTTPException) as exc:
        await get_game_authoring_contract(current_user=_user(), audience="agents")

    assert exc.value.status_code == 422
    assert "Expected one of: agent, user." in str(exc.value.detail)


@pytest.mark.asyncio
async def test_game_authoring_contract_discovers_saved_projects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = SimpleNamespace(
        id=101,
        name="Bananza Boat Seed Project",
        source_world_id=77,
        origin_kind="demo",
        origin_source_key="bananza.bootstrap",
        origin_meta={
            "project_runtime": {
                "mode": "api",
                "sync_mode": "two_way",
                "watch_enabled": False,
            }
        },
        updated_at=datetime(2026, 3, 17, 10, 0, tzinfo=timezone.utc),
    )

    class _StorageStub:
        def __init__(self, _db) -> None:
            pass

        async def list_projects(self, **_kwargs):
            return [project]

    monkeypatch.setattr(game_meta_module, "GameProjectStorageService", _StorageStub)

    result = await get_game_authoring_contract(
        current_user=_user(),
        game_world_service=SimpleNamespace(db=object()),
    )

    assert result.discovered_projects
    discovered = result.discovered_projects[0]
    assert discovered.project_id == 101
    assert discovered.name == "Bananza Boat Seed Project"
    assert discovered.source_world_id == 77
    assert discovered.provenance_kind == "demo"
    assert discovered.provenance_source_key == "bananza.bootstrap"
    assert discovered.runtime_preferences["mode"] == "api"
    assert discovered.runtime_preferences["sync_mode"] == "two_way"
    assert "bananza" in discovered.tags
    assert "seeded" in discovered.tags


@pytest.mark.asyncio
async def test_game_authoring_contract_discovers_loaded_game_routes() -> None:
    app = FastAPI()

    @app.get("/api/v1/game/worlds")
    async def _list_worlds():
        return []

    @app.post("/api/v1/game/worlds")
    async def _create_world():
        return {"id": 1}

    @app.get("/api/v1/game/npcs")
    async def _list_npcs():
        return []

    request = SimpleNamespace(app=app)
    result = await get_game_authoring_contract(
        current_user=_user(),
        request=request,
        game_world_service=SimpleNamespace(db=None),
    )

    endpoints_by_method_path = {
        (endpoint.method, endpoint.path): endpoint for endpoint in result.endpoints
    }

    assert endpoints_by_method_path[("GET", "/api/v1/game/worlds")].id == "game.worlds.list"
    assert endpoints_by_method_path[("POST", "/api/v1/game/worlds")].id == "game.worlds.create"

    npc_endpoint = endpoints_by_method_path[("GET", "/api/v1/game/npcs")]
    assert npc_endpoint.id.startswith("game.auto.get.npcs")
    assert "Auto-discovered" in (npc_endpoint.notes or "")

    endpoint_ids = {endpoint.id for endpoint in result.endpoints}
    assert "blocks.content_packs" in endpoint_ids
