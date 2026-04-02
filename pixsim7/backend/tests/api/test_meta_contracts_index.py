"""Tests for global meta contract index endpoint."""
from __future__ import annotations

from datetime import datetime

import pytest
from fastapi import FastAPI

from pixsim7.backend.main.api.v1.meta_contracts import (
    list_contract_endpoints,
    list_policy_contracts,
)
from pixsim7.backend.main.shared.config import settings


@pytest.mark.asyncio
async def test_contracts_index_lists_prompt_contracts() -> None:
    result = await list_contract_endpoints()

    assert result.version
    assert any(
        contract.id == "prompts.analysis"
        and contract.endpoint == "/api/v1/prompts/meta/analysis-contract"
        for contract in result.contracts
    )
    assert any(
        contract.id == "prompts.authoring"
        and contract.endpoint == "/api/v1/prompts/meta/authoring-contract"
        for contract in result.contracts
    )
    assert any(
        contract.id == "game.authoring"
        and contract.endpoint == "/api/v1/game/meta/authoring-contract"
        for contract in result.contracts
    )
    # Ensure generated_at is valid ISO datetime string.
    datetime.fromisoformat(result.generated_at.replace("Z", "+00:00"))


@pytest.mark.asyncio
async def test_contracts_index_includes_blocks_discovery() -> None:
    result = await list_contract_endpoints()

    blocks = next(
        (c for c in result.contracts if c.id == "blocks.discovery"), None
    )
    assert blocks is not None
    assert "tag_vocabulary" in blocks.provides
    assert "block_catalog" in blocks.provides
    assert len(blocks.sub_endpoints) >= 4
    # Has tag dictionary sub-endpoint
    assert any(ep.id == "blocks.tag_dictionary" for ep in blocks.sub_endpoints)
    # Has block matrix sub-endpoint with the canonical path
    assert any(
        ep.id == "blocks.matrix"
        and ep.path == "/api/v1/block-templates/meta/blocks/matrix"
        for ep in blocks.sub_endpoints
    )


@pytest.mark.asyncio
async def test_contracts_index_has_bidirectional_relates_to() -> None:
    result = await list_contract_endpoints()

    contracts_by_id = {c.id: c for c in result.contracts}

    # prompts.authoring relates to blocks.discovery
    authoring = contracts_by_id["prompts.authoring"]
    assert "blocks.discovery" in authoring.relates_to

    # blocks.discovery relates back to prompts.authoring
    blocks = contracts_by_id["blocks.discovery"]
    assert "prompts.authoring" in blocks.relates_to

    # prompts.analysis and prompts.authoring relate to each other
    analysis = contracts_by_id["prompts.analysis"]
    assert "prompts.authoring" in analysis.relates_to
    assert "prompts.analysis" in authoring.relates_to


@pytest.mark.asyncio
async def test_contracts_index_provides_fields_are_populated() -> None:
    result = await list_contract_endpoints()

    for contract in result.contracts:
        assert len(contract.provides) > 0, f"{contract.id} has empty provides"


@pytest.mark.asyncio
async def test_contracts_index_includes_endpoint_metadata() -> None:
    original_db_only = settings.plans_db_only_mode
    settings.plans_db_only_mode = True
    try:
        result = await list_contract_endpoints()
    finally:
        settings.plans_db_only_mode = original_db_only

    plans = next((c for c in result.contracts if c.id == "plans.management"), None)
    assert plans is not None

    endpoints = {ep.id: ep for ep in plans.sub_endpoints}
    settings_update = endpoints["plans.settings_update"]
    assert settings_update.requires_admin is True
    assert "admin" in settings_update.permissions
    assert settings_update.auth_required is True
    assert settings_update.input_schema is not None

    progress_endpoint = endpoints["plans.progress"]
    assert progress_endpoint.method == "POST"
    assert progress_endpoint.path == "/api/v1/dev/plans/progress/{plan_id}"
    assert progress_endpoint.input_schema is not None

    authoring_contract = endpoints["plans.meta_authoring_contract"]
    assert authoring_contract.method == "GET"
    assert authoring_contract.path == "/api/v1/dev/plans/meta/authoring-contract"

    create_endpoint = endpoints["plans.create"]
    assert create_endpoint.input_schema is not None
    assert create_endpoint.input_schema.get("x-policy-ref") == "/api/v1/dev/plans/meta/authoring-contract"
    update_endpoint = endpoints["plans.update"]
    assert update_endpoint.input_schema is not None
    assert update_endpoint.input_schema.get("x-policy-ref") == "/api/v1/dev/plans/meta/authoring-contract"
    assert progress_endpoint.input_schema.get("x-policy-ref") == "/api/v1/dev/plans/meta/authoring-contract"

    sync_endpoint = endpoints["plans.sync"]
    assert sync_endpoint.availability.status == "disabled"
    assert sync_endpoint.availability.reason


@pytest.mark.asyncio
async def test_contracts_index_includes_contract_tool_names() -> None:
    result = await list_contract_endpoints()

    plans = next((c for c in result.contracts if c.id == "plans.management"), None)
    assert plans is not None
    assert "plans_management__plans_create" in plans.tool_names
    assert "plans_management__plans_sync" not in plans.tool_names  # disabled endpoint

    endpoint = next((ep for ep in plans.sub_endpoints if ep.id == "plans.create"), None)
    assert endpoint is not None
    assert endpoint.tool_name == "plans_management__plans_create"


@pytest.mark.asyncio
async def test_contracts_index_includes_structured_notifications_emit_endpoint() -> None:
    result = await list_contract_endpoints()

    notifications = next((c for c in result.contracts if c.id == "notifications"), None)
    assert notifications is not None
    assert "notification_structured_emit" in notifications.provides

    endpoints = {ep.id: ep for ep in notifications.sub_endpoints}
    emit_endpoint = endpoints["notifications.emit"]
    assert emit_endpoint.method == "POST"
    assert emit_endpoint.path == "/api/v1/notifications/emit"
    assert emit_endpoint.input_schema is not None
    assert "structured" in emit_endpoint.tags


@pytest.mark.asyncio
async def test_contracts_index_auto_discovers_game_route_groups_from_request_app() -> None:
    app = FastAPI()

    @app.get("/api/v1/game/npcs")
    async def _list_npcs():
        return []

    @app.post("/api/v1/game/npcs")
    async def _create_npcs():
        return {"ok": True}

    @app.get("/api/v1/game/scenes/{scene_id}")
    async def _get_scene(scene_id: int):
        return {"id": scene_id}

    request = type("Req", (), {"app": app})()
    result = await list_contract_endpoints(request=request)
    contracts_by_id = {contract.id: contract for contract in result.contracts}

    npcs = contracts_by_id.get("game.routes.npcs")
    assert npcs is not None
    assert npcs.endpoint == "/api/v1/game/npcs"
    assert "game_api_routes" in npcs.provides
    assert "game.authoring" in npcs.relates_to

    scenes = contracts_by_id.get("game.routes.scenes")
    assert scenes is not None
    assert scenes.endpoint == "/api/v1/game/scenes"


@pytest.mark.asyncio
async def test_policies_index_lists_cross_domain_policy_contracts() -> None:
    result = await list_policy_contracts()

    assert result.version
    datetime.fromisoformat(result.generated_at.replace("Z", "+00:00"))

    by_domain = {entry.domain: entry for entry in result.policies}
    assert "plans" in by_domain
    assert "prompts" in by_domain
    assert "game" in by_domain

    plans = by_domain["plans"]
    assert plans.endpoint == "/api/v1/dev/plans/meta/authoring-contract"
    assert plans.rules_count >= 1
    assert "plans.create" in plans.endpoints

    prompts = by_domain["prompts"]
    assert prompts.endpoint == "/api/v1/prompts/meta/authoring-contract"

    game = by_domain["game"]
    assert game.endpoint == "/api/v1/game/meta/authoring-contract"
