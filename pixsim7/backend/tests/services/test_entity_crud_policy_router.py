"""Tests for entity CRUD policy hook wiring helpers."""

from __future__ import annotations

from uuid import UUID
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, HTTPException
from fastapi.routing import APIRoute
from sqlmodel import SQLModel

from pixsim7.backend.main.services.entity_crud.crud_registry import (
    NestedEntitySpec,
    TemplateCRUDSpec,
)
from pixsim7.backend.main.services.entity_crud import crud_router

TEST_SUITE = {
    "id": "entity-crud-policy-router",
    "label": "Entity CRUD Policy Router Hooks",
    "kind": "unit",
    "category": "backend/services",
    "subcategory": "entity-crud",
    "covers": [
        "pixsim7/backend/main/services/entity_crud/crud_router.py",
    ],
    "order": 40.2,
}


def _spec() -> TemplateCRUDSpec:
    return TemplateCRUDSpec(
        kind="gameWidget",
        model=SQLModel,
        url_prefix="widgets",
    )


def _nested() -> NestedEntitySpec:
    return NestedEntitySpec(
        kind="hotspot",
        parent_field="widget_id",
        url_suffix="hotspots",
        model=SQLModel,
    )


def _route_endpoint(router: APIRouter, path: str, method: str):
    method_upper = method.upper()
    for route in router.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path == path and method_upper in route.methods:
            return route.endpoint
    raise AssertionError(f"Route not found for {method_upper} {path}")


class _FakeTemplateService:
    def __init__(self, *args, **kwargs):
        del args, kwargs

    async def create(self, data):
        return {"id": "created", **data}

    async def update(self, entity_id, data):
        return {"id": entity_id, **data}

    async def delete(self, entity_id, hard=False):
        del entity_id, hard
        return True

    async def delete_with_nested(self, entity_id, hard=False):
        del entity_id, hard
        return True

    async def transform_response(self, item):
        return item


class _FakeNestedService:
    def __init__(self, *args, **kwargs):
        del args, kwargs

    async def create(self, data):
        return {"id": "nested-created", **data}

    async def update(self, entity_id, data):
        return {"id": entity_id, **data}

    async def delete(self, entity_id):
        del entity_id
        return True

    async def replace_all(self, items):
        return items


def test_build_entity_policy_endpoint_id_for_primary_and_nested() -> None:
    spec = _spec()
    nested = _nested()

    primary = crud_router._build_entity_policy_endpoint_id(spec, "create")
    nested_id = crud_router._build_entity_policy_endpoint_id(spec, "update", nested=nested)

    assert primary == "game.gameWidget.create"
    assert nested_id == "game.gameWidget.hotspot.update"


def test_enforce_domain_policy_no_engine_is_noop(monkeypatch) -> None:
    monkeypatch.setattr(crud_router, "_get_domain_policy_engine", lambda _domain: None)

    crud_router._enforce_domain_policy_or_400(
        endpoint_id="game.gameWidget.create",
        payload={"name": "A"},
        principal=SimpleNamespace(id=1),
    )


def test_enforce_domain_policy_raises_http_400_with_contract(monkeypatch) -> None:
    class _FakeEngine:
        contract_endpoint = "/api/v1/game/meta/authoring-contract"

        def validate(self, endpoint_id, payload, principal, *, partial=False):
            del endpoint_id, payload, principal, partial
            return (["synthetic violation"], [])

    monkeypatch.setattr(crud_router, "_get_domain_policy_engine", lambda _domain: _FakeEngine())

    with pytest.raises(HTTPException) as exc:
        crud_router._enforce_domain_policy_or_400(
            endpoint_id="game.gameWidget.create",
            payload={"name": "A"},
            principal=SimpleNamespace(id=1),
        )

    assert exc.value.status_code == 400
    detail = exc.value.detail
    assert detail["message"] == "Entity authoring policy violation"
    assert detail["errors"] == ["synthetic violation"]
    assert detail["contract"] == "/api/v1/game/meta/authoring-contract"


@pytest.mark.asyncio
async def test_primary_routes_call_policy_with_expected_payloads(monkeypatch) -> None:
    router = APIRouter()
    spec = _spec()
    crud_router._register_create_route(router, spec)
    crud_router._register_update_route(router, spec)
    crud_router._register_delete_route(router, spec)

    policy_calls = []

    def _capture_policy_call(**kwargs):
        policy_calls.append(kwargs)

    monkeypatch.setattr(crud_router, "_enforce_domain_policy_or_400", _capture_policy_call)
    monkeypatch.setattr(crud_router, "TemplateCRUDService", _FakeTemplateService)

    user = SimpleNamespace(id=7, principal_type="agent")
    db = object()

    create_endpoint = _route_endpoint(router, "/widgets", "POST")
    update_endpoint = _route_endpoint(router, "/widgets/{entity_id}", "PUT")
    delete_endpoint = _route_endpoint(router, "/widgets/{entity_id}", "DELETE")

    created = await create_endpoint(
        data={"name": "Alpha"},
        world_id=11,
        session_id=22,
        db=db,
        current_user=user,
    )
    updated = await update_endpoint(
        entity_id="widget-1",
        data={"name": "Beta"},
        world_id=11,
        session_id=22,
        db=db,
        current_user=user,
    )
    deleted = await delete_endpoint(
        entity_id="widget-1",
        hard=True,
        cascade=False,
        world_id=11,
        session_id=22,
        db=db,
        current_user=user,
    )

    assert created["id"] == "created"
    assert updated["id"] == "widget-1"
    assert deleted.success is True

    assert [call["endpoint_id"] for call in policy_calls] == [
        "game.gameWidget.create",
        "game.gameWidget.update",
        "game.gameWidget.delete",
    ]
    assert [call["partial"] for call in policy_calls] == [False, True, True]
    assert policy_calls[0]["payload"] == {
        "name": "Alpha",
        "world_id": None,
        "session_id": None,
    }
    assert policy_calls[1]["payload"] == {
        "name": "Beta",
        "entity_id": "widget-1",
        "world_id": None,
        "session_id": None,
    }
    assert policy_calls[2]["payload"] == {
        "entity_id": "widget-1",
        "hard": True,
        "cascade": False,
        "world_id": None,
        "session_id": None,
    }


@pytest.mark.asyncio
async def test_nested_routes_call_policy_with_expected_payloads(monkeypatch) -> None:
    router = APIRouter()
    spec = _spec()
    nested = _nested()
    crud_router._register_nested_entity_routes(router, spec, nested)

    policy_calls = []

    def _capture_policy_call(**kwargs):
        policy_calls.append(kwargs)

    monkeypatch.setattr(crud_router, "_enforce_domain_policy_or_400", _capture_policy_call)
    monkeypatch.setattr(crud_router, "NestedEntityService", _FakeNestedService)

    user = SimpleNamespace(id=9, principal_type="agent")
    db = object()
    parent_id = str(UUID("00000000-0000-0000-0000-000000000042"))

    create_endpoint = _route_endpoint(router, "/widgets/{parent_id}/hotspots", "POST")
    update_endpoint = _route_endpoint(router, "/widgets/{parent_id}/hotspots/{entity_id}", "PUT")
    delete_endpoint = _route_endpoint(router, "/widgets/{parent_id}/hotspots/{entity_id}", "DELETE")
    replace_all_endpoint = _route_endpoint(router, "/widgets/{parent_id}/hotspots", "PUT")

    created = await create_endpoint(
        parent_id=parent_id,
        data={"name": "Hotspot A"},
        world_id=5,
        session_id=6,
        db=db,
        current_user=user,
    )
    updated = await update_endpoint(
        parent_id=parent_id,
        entity_id="hotspot-1",
        data={"name": "Hotspot B"},
        world_id=5,
        session_id=6,
        db=db,
        current_user=user,
    )
    deleted = await delete_endpoint(
        parent_id=parent_id,
        entity_id="hotspot-1",
        world_id=5,
        session_id=6,
        db=db,
        current_user=user,
    )
    replaced = await replace_all_endpoint(
        parent_id=parent_id,
        data={"items": [{"name": "Hotspot C"}]},
        world_id=5,
        session_id=6,
        db=db,
        current_user=user,
    )

    assert created["id"] == "nested-created"
    assert updated["id"] == "hotspot-1"
    assert deleted.success is True
    assert replaced["total"] == 1

    assert [call["endpoint_id"] for call in policy_calls] == [
        "game.gameWidget.hotspot.create",
        "game.gameWidget.hotspot.update",
        "game.gameWidget.hotspot.delete",
        "game.gameWidget.hotspot.replace_all",
    ]
    assert [call["partial"] for call in policy_calls] == [False, True, True, False]
    assert policy_calls[0]["payload"] == {
        "name": "Hotspot A",
        "parent_id": parent_id,
        "world_id": None,
        "session_id": None,
    }
    assert policy_calls[1]["payload"] == {
        "name": "Hotspot B",
        "parent_id": parent_id,
        "entity_id": "hotspot-1",
        "world_id": None,
        "session_id": None,
    }
    assert policy_calls[2]["payload"] == {
        "parent_id": parent_id,
        "entity_id": "hotspot-1",
        "world_id": None,
        "session_id": None,
    }
    assert policy_calls[3]["payload"] == {
        "parent_id": parent_id,
        "items": [{"name": "Hotspot C"}],
        "world_id": None,
        "session_id": None,
    }
