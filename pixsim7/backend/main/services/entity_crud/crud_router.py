"""
Entity CRUD Router Factory - Auto-generates API routes from registry.

Creates FastAPI routers with standardized CRUD endpoints for all registered
entity types.

Usage:
    # In api/v1/__init__.py or similar
    from pixsim7.backend.main.services.entity_crud import create_template_crud_router

    templates_router = create_template_crud_router()
    app.include_router(templates_router, prefix="/api/v1/game")
"""
from __future__ import annotations

import importlib
import re
from typing import Any, Dict, List, Optional, Type
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, create_model
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.services.ownership import (
    OwnershipScope,
    assert_can_access,
    assert_session_access,
    assert_world_access,
)
from pixsim7.backend.main.services.docs.policy_engine import (
    DOMAIN_POLICY_REGISTRY,
    PolicyEngine,
)
from pixsim_logging import get_logger

from .crud_registry import TemplateCRUDSpec, NestedEntitySpec, CustomAction, get_template_crud_registry
from .crud_service import TemplateCRUDService, NestedEntityService, CRUDValidationError

logger = get_logger()
ENTITY_CRUD_POLICY_DOMAIN = "game"



# =============================================================================
# Generic Response Models (shared with crud.registry)
# =============================================================================

from pixsim7.backend.main.services.crud.primitives import (
    PaginatedResponse,
    DeleteResponse,
    ErrorResponse,
)


# =============================================================================
# Dynamic Schema Generation
# =============================================================================


def create_list_response_model(spec: TemplateCRUDSpec) -> Type[BaseModel]:
    """Create a typed list response model for a spec."""
    item_model = spec.response_schema or spec.model

    return create_model(
        f"{spec.kind}ListResponse",
        items=(List[item_model], ...),
        total=(int, ...),
        limit=(int, ...),
        offset=(int, ...),
        has_more=(bool, ...),
    )


def _ensure_policy_domain_registered(domain: str) -> None:
    if DOMAIN_POLICY_REGISTRY.get(domain):
        return
    if domain == ENTITY_CRUD_POLICY_DOMAIN:
        importlib.import_module("pixsim7.backend.main.services.game.game_authoring_policy")


def _get_domain_policy_engine(domain: str) -> Optional[PolicyEngine]:
    _ensure_policy_domain_registered(domain)
    return DOMAIN_POLICY_REGISTRY.get(domain)


def _build_entity_policy_endpoint_id(
    spec: TemplateCRUDSpec,
    action: str,
    *,
    nested: Optional[NestedEntitySpec] = None,
) -> str:
    action_key = str(action or "").strip()
    if nested is not None:
        return f"{ENTITY_CRUD_POLICY_DOMAIN}.{spec.kind}.{nested.kind}.{action_key}"
    return f"{ENTITY_CRUD_POLICY_DOMAIN}.{spec.kind}.{action_key}"


def _enforce_domain_policy_or_400(
    *,
    endpoint_id: str,
    payload: Dict[str, Any],
    principal: Any,
    partial: bool = False,
) -> None:
    engine = _get_domain_policy_engine(ENTITY_CRUD_POLICY_DOMAIN)
    if engine is None:
        return

    violations, warnings = engine.validate(
        endpoint_id,
        payload,
        principal,
        partial=partial,
    )
    if warnings:
        logger.info(
            "entity_crud_policy_warning",
            domain=ENTITY_CRUD_POLICY_DOMAIN,
            endpoint_id=endpoint_id,
            warnings=warnings,
        )
    if violations:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Entity authoring policy violation",
                "errors": violations,
                "contract": engine.contract_endpoint,
            },
        )


# =============================================================================
# Route Registration
# =============================================================================


def _resolve_owner_id(spec: TemplateCRUDSpec, current_user: User) -> Optional[int]:
    """Resolve owner ID for scoped or policy-based access."""
    if spec.scope_to_owner:
        return getattr(current_user, "id", None)
    if spec.ownership_policy and spec.ownership_policy.scope == OwnershipScope.USER:
        return getattr(current_user, "id", None)
    return None


def _resolve_scope_context(
    spec: TemplateCRUDSpec,
    current_user: User,
    world_id: Optional[int],
    session_id: Optional[int],
) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Resolve owner/world/session IDs based on spec and policy."""
    owner_id = _resolve_owner_id(spec, current_user)
    if not spec.ownership_policy:
        return owner_id, None, None
    if spec.ownership_policy.scope == OwnershipScope.WORLD:
        return owner_id, world_id, None
    if spec.ownership_policy.scope == OwnershipScope.SESSION:
        return owner_id, None, session_id
    return owner_id, None, None


async def _ensure_parent_access(
    *,
    spec: TemplateCRUDSpec,
    parent_id: str,
    db: AsyncSession,
    current_user: User,
    owner_id: Optional[int],
    world_id: Optional[int],
    session_id: Optional[int],
) -> None:
    if not (spec.scope_to_owner or spec.ownership_policy):
        return
    service = TemplateCRUDService(
        db,
        spec,
        owner_id=owner_id,
        user=current_user,
        world_id=world_id,
        session_id=session_id,
    )
    parent = await service.get(parent_id)
    if not parent:
        raise HTTPException(status_code=404, detail=f"{spec.kind} not found")


async def _ensure_scope_access(
    *,
    spec: TemplateCRUDSpec,
    db: AsyncSession,
    current_user: User,
    world_id: Optional[int],
    session_id: Optional[int],
) -> None:
    if not spec.ownership_policy:
        return
    if spec.ownership_policy.scope == OwnershipScope.WORLD:
        await assert_world_access(db=db, user=current_user, world_id=world_id)
    elif spec.ownership_policy.scope == OwnershipScope.SESSION:
        await assert_session_access(db=db, user=current_user, session_id=session_id)


def _register_list_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register GET list endpoint."""
    response_model = spec.list_response_schema or create_list_response_model(spec)
    ownership_policy = spec.ownership_policy

    @router.get(
        f"/{spec.url_prefix}",
        response_model=response_model,
        summary=f"List {spec.kind}",
        description=spec.description or f"List all {spec.kind} entities with pagination and filtering.",
        tags=spec.tags,
    )
    async def list_items(
        limit: int = Query(spec.default_limit, ge=1, le=spec.max_limit),
        offset: int = Query(0, ge=0),
        is_active: Optional[bool] = Query(None),
        search: Optional[str] = Query(None, description="Search in name field"),
        include_inactive: bool = Query(False, description="Include inactive items"),
        world_id: Optional[int] = Query(None),
        session_id: Optional[int] = Query(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        # Build owner ID if scoped
        owner_id, world_id, session_id = _resolve_scope_context(
            spec,
            current_user,
            world_id,
            session_id,
        )
        if ownership_policy:
            assert_can_access(
                user=current_user,
                policy=ownership_policy,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            await _ensure_scope_access(
                spec=spec,
                db=db,
                current_user=current_user,
                world_id=world_id,
                session_id=session_id,
            )
        service = TemplateCRUDService(
            db,
            spec,
            owner_id=owner_id,
            user=current_user,
            world_id=world_id,
            session_id=session_id,
        )

        filters = {}
        if is_active is not None:
            filters["is_active"] = is_active

        items, total = await service.list(
            limit=limit,
            offset=offset,
            filters=filters if filters else None,
            search=search,
            include_inactive=include_inactive,
        )

        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(items) < total,
        }


def _register_get_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register GET single item endpoint."""
    response_model = spec.response_schema or spec.model
    ownership_policy = spec.ownership_policy

    @router.get(
        f"/{spec.url_prefix}/{{entity_id}}",
        response_model=response_model,
        summary=f"Get {spec.kind}",
        description=f"Get a single {spec.kind} by ID.",
        tags=spec.tags,
        responses={404: {"model": ErrorResponse}},
    )
    async def get_item(
        entity_id: str,
        world_id: Optional[int] = Query(None),
        session_id: Optional[int] = Query(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        owner_id, world_id, session_id = _resolve_scope_context(
            spec,
            current_user,
            world_id,
            session_id,
        )
        if ownership_policy:
            assert_can_access(
                user=current_user,
                policy=ownership_policy,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            await _ensure_scope_access(
                spec=spec,
                db=db,
                current_user=current_user,
                world_id=world_id,
                session_id=session_id,
            )
        service = TemplateCRUDService(
            db,
            spec,
            owner_id=owner_id,
            user=current_user,
            world_id=world_id,
            session_id=session_id,
        )
        item = await service.get(entity_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"{spec.kind} not found")
        # Apply transformation
        return await service.transform_response(item)


def _register_create_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register POST create endpoint."""
    request_model = spec.create_schema or spec.model
    response_model = spec.response_schema or spec.model
    ownership_policy = spec.ownership_policy

    @router.post(
        f"/{spec.url_prefix}",
        response_model=response_model,
        summary=f"Create {spec.kind}",
        description=f"Create a new {spec.kind}. If upsert is enabled and unique field exists, updates instead.",
        tags=spec.tags,
        status_code=201,
    )
    async def create_item(
        data: Dict[str, Any],
        world_id: Optional[int] = Query(None),
        session_id: Optional[int] = Query(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        owner_id, world_id, session_id = _resolve_scope_context(
            spec,
            current_user,
            world_id,
            session_id,
        )
        if ownership_policy:
            assert_can_access(
                user=current_user,
                policy=ownership_policy,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            await _ensure_scope_access(
                spec=spec,
                db=db,
                current_user=current_user,
                world_id=world_id,
                session_id=session_id,
            )
        policy_payload = dict(data or {})
        policy_payload.setdefault("world_id", world_id)
        policy_payload.setdefault("session_id", session_id)
        _enforce_domain_policy_or_400(
            endpoint_id=_build_entity_policy_endpoint_id(spec, "create"),
            payload=policy_payload,
            principal=current_user,
            partial=False,
        )
        service = TemplateCRUDService(
            db,
            spec,
            owner_id=owner_id,
            user=current_user,
            world_id=world_id,
            session_id=session_id,
        )
        try:
            item = await service.create(data)
            return await service.transform_response(item)
        except CRUDValidationError as e:
            raise HTTPException(status_code=422, detail=e.message)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))


def _register_update_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register PUT/PATCH update endpoint."""
    request_model = spec.update_schema or Dict[str, Any]
    response_model = spec.response_schema or spec.model
    ownership_policy = spec.ownership_policy

    @router.put(
        f"/{spec.url_prefix}/{{entity_id}}",
        response_model=response_model,
        summary=f"Update {spec.kind}",
        description=f"Update an existing {spec.kind}.",
        tags=spec.tags,
        responses={404: {"model": ErrorResponse}},
    )
    async def update_item(
        entity_id: str,
        data: Dict[str, Any],
        world_id: Optional[int] = Query(None),
        session_id: Optional[int] = Query(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        owner_id, world_id, session_id = _resolve_scope_context(
            spec,
            current_user,
            world_id,
            session_id,
        )
        if ownership_policy:
            assert_can_access(
                user=current_user,
                policy=ownership_policy,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            await _ensure_scope_access(
                spec=spec,
                db=db,
                current_user=current_user,
                world_id=world_id,
                session_id=session_id,
            )
        policy_payload = dict(data or {})
        policy_payload.setdefault("entity_id", entity_id)
        policy_payload.setdefault("world_id", world_id)
        policy_payload.setdefault("session_id", session_id)
        _enforce_domain_policy_or_400(
            endpoint_id=_build_entity_policy_endpoint_id(spec, "update"),
            payload=policy_payload,
            principal=current_user,
            partial=True,
        )
        service = TemplateCRUDService(
            db,
            spec,
            owner_id=owner_id,
            user=current_user,
            world_id=world_id,
            session_id=session_id,
        )
        try:
            item = await service.update(entity_id, data)
            if not item:
                raise HTTPException(status_code=404, detail=f"{spec.kind} not found")
            return await service.transform_response(item)
        except CRUDValidationError as e:
            raise HTTPException(status_code=422, detail=e.message)


def _register_delete_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register DELETE endpoint."""
    ownership_policy = spec.ownership_policy

    @router.delete(
        f"/{spec.url_prefix}/{{entity_id}}",
        response_model=DeleteResponse,
        summary=f"Delete {spec.kind}",
        description=f"Delete a {spec.kind}. Uses soft delete if supported.",
        tags=spec.tags,
        responses={404: {"model": ErrorResponse}},
    )
    async def delete_item(
        entity_id: str,
        hard: bool = Query(False, description="Hard delete instead of soft delete"),
        cascade: bool = Query(False, description="Cascade delete nested entities"),
        world_id: Optional[int] = Query(None),
        session_id: Optional[int] = Query(None),
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        owner_id, world_id, session_id = _resolve_scope_context(
            spec,
            current_user,
            world_id,
            session_id,
        )
        if ownership_policy:
            assert_can_access(
                user=current_user,
                policy=ownership_policy,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            await _ensure_scope_access(
                spec=spec,
                db=db,
                current_user=current_user,
                world_id=world_id,
                session_id=session_id,
            )
        _enforce_domain_policy_or_400(
            endpoint_id=_build_entity_policy_endpoint_id(spec, "delete"),
            payload={
                "entity_id": entity_id,
                "hard": hard,
                "cascade": cascade,
                "world_id": world_id,
                "session_id": session_id,
            },
            principal=current_user,
            partial=True,
        )
        service = TemplateCRUDService(
            db,
            spec,
            owner_id=owner_id,
            user=current_user,
            world_id=world_id,
            session_id=session_id,
        )

        if cascade and spec.nested_entities:
            success = await service.delete_with_nested(entity_id, hard=hard)
        else:
            success = await service.delete(entity_id, hard=hard)

        if not success:
            raise HTTPException(status_code=404, detail=f"{spec.kind} not found")
        return DeleteResponse(
            success=True,
            message=f"{spec.kind} {'deleted' if hard else 'deactivated'} successfully"
        )


def _register_custom_action_route(
    router: APIRouter,
    spec: TemplateCRUDSpec,
    action: CustomAction,
) -> None:
    """Register a custom action endpoint."""
    path = f"/{spec.url_prefix}{action.path_suffix}"

    if action.method.upper() == "POST":
        @router.post(
            path,
            response_model=action.response_schema,
            summary=f"{spec.kind}: {action.name}",
            description=action.description or f"Custom action: {action.name}",
            tags=spec.tags,
        )
        async def custom_action_post(
            entity_id: str = None,
            data: Dict[str, Any] = None,
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _action: CustomAction = action,
        ):
            return await _action.handler(
                db=db,
                user=current_user,
                entity_id=entity_id,
                data=data,
                spec=spec,
            )

    elif action.method.upper() == "PUT":
        @router.put(
            path,
            response_model=action.response_schema,
            summary=f"{spec.kind}: {action.name}",
            description=action.description or f"Custom action: {action.name}",
            tags=spec.tags,
        )
        async def custom_action_put(
            entity_id: str = None,
            data: Dict[str, Any] = None,
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _action: CustomAction = action,
        ):
            return await _action.handler(
                db=db,
                user=current_user,
                entity_id=entity_id,
                data=data,
                spec=spec,
            )


def _register_nested_entity_routes(
    router: APIRouter,
    spec: TemplateCRUDSpec,
    nested: NestedEntitySpec,
) -> None:
    """Register CRUD routes for nested entities."""
    base_path = f"/{spec.url_prefix}/{{parent_id}}/{nested.url_suffix}"
    ownership_policy = spec.ownership_policy

    if nested.enable_list:
        @router.get(
            base_path,
            summary=f"List {nested.kind} under {spec.kind}",
            tags=spec.tags,
        )
        async def list_nested(
            parent_id: str,
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )
            items = await service.list()
            return {"items": items, "total": len(items)}

    if nested.enable_get:
        @router.get(
            f"{base_path}/{{entity_id}}",
            summary=f"Get {nested.kind}",
            tags=spec.tags,
        )
        async def get_nested(
            parent_id: str,
            entity_id: str,
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )
            item = await service.get(entity_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"{nested.kind} not found")
            return item

    if nested.enable_create:
        @router.post(
            base_path,
            summary=f"Create {nested.kind}",
            tags=spec.tags,
            status_code=201,
        )
        async def create_nested(
            parent_id: str,
            data: Dict[str, Any],
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            policy_payload = dict(data or {})
            policy_payload.setdefault("parent_id", parent_id)
            policy_payload.setdefault("world_id", world_id)
            policy_payload.setdefault("session_id", session_id)
            _enforce_domain_policy_or_400(
                endpoint_id=_build_entity_policy_endpoint_id(spec, "create", nested=nested),
                payload=policy_payload,
                principal=current_user,
                partial=False,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )
            return await service.create(data)

    if nested.enable_update:
        @router.put(
            f"{base_path}/{{entity_id}}",
            summary=f"Update {nested.kind}",
            tags=spec.tags,
        )
        async def update_nested(
            parent_id: str,
            entity_id: str,
            data: Dict[str, Any],
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            policy_payload = dict(data or {})
            policy_payload.setdefault("parent_id", parent_id)
            policy_payload.setdefault("entity_id", entity_id)
            policy_payload.setdefault("world_id", world_id)
            policy_payload.setdefault("session_id", session_id)
            _enforce_domain_policy_or_400(
                endpoint_id=_build_entity_policy_endpoint_id(spec, "update", nested=nested),
                payload=policy_payload,
                principal=current_user,
                partial=True,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )
            item = await service.update(entity_id, data)
            if not item:
                raise HTTPException(status_code=404, detail=f"{nested.kind} not found")
            return item

    if nested.enable_delete:
        @router.delete(
            f"{base_path}/{{entity_id}}",
            response_model=DeleteResponse,
            summary=f"Delete {nested.kind}",
            tags=spec.tags,
        )
        async def delete_nested(
            parent_id: str,
            entity_id: str,
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            _enforce_domain_policy_or_400(
                endpoint_id=_build_entity_policy_endpoint_id(spec, "delete", nested=nested),
                payload={
                    "parent_id": parent_id,
                    "entity_id": entity_id,
                    "world_id": world_id,
                    "session_id": session_id,
                },
                principal=current_user,
                partial=True,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )
            success = await service.delete(entity_id)
            if not success:
                raise HTTPException(status_code=404, detail=f"{nested.kind} not found")
            return DeleteResponse(success=True, message=f"{nested.kind} deleted")

    # Replace all endpoint - enabled when both create and delete are enabled
    if nested.enable_create and nested.enable_delete:
        @router.put(
            base_path,
            summary=f"Replace all {nested.kind} under {spec.kind}",
            description=f"Atomically replace all {nested.kind} entities. Deletes existing and creates new ones.",
            tags=spec.tags,
        )
        async def replace_all_nested(
            parent_id: str,
            data: Dict[str, Any],
            world_id: Optional[int] = Query(None),
            session_id: Optional[int] = Query(None),
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
        ):
            parsed_parent_id = spec.id_parser(parent_id)
            owner_id, world_id, session_id = _resolve_scope_context(
                spec,
                current_user,
                world_id,
                session_id,
            )
            if ownership_policy:
                assert_can_access(
                    user=current_user,
                    policy=ownership_policy,
                    owner_id=owner_id,
                    world_id=world_id,
                    session_id=session_id,
                )
                await _ensure_scope_access(
                    spec=spec,
                    db=db,
                    current_user=current_user,
                    world_id=world_id,
                    session_id=session_id,
                )
            await _ensure_parent_access(
                spec=spec,
                parent_id=parent_id,
                db=db,
                current_user=current_user,
                owner_id=owner_id,
                world_id=world_id,
                session_id=session_id,
            )
            service = NestedEntityService(
                db,
                nested,
                parent_id,
                parsed_parent_id,
                world_id=world_id,
                session_id=session_id,
            )

            # Expect data in format {"items": [...]} or just a list
            items = data.get("items", data) if isinstance(data, dict) else data
            if not isinstance(items, list):
                items = [items] if items else []

            _enforce_domain_policy_or_400(
                endpoint_id=_build_entity_policy_endpoint_id(spec, "replace_all", nested=nested),
                payload={
                    "parent_id": parent_id,
                    "items": items,
                    "world_id": world_id,
                    "session_id": session_id,
                },
                principal=current_user,
                partial=False,
            )
            created = await service.replace_all(items)
            return {"items": created, "total": len(created)}


def _register_crud_routes(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register all enabled CRUD routes for a spec."""
    # Standard CRUD routes
    if spec.enable_list:
        _register_list_route(router, spec)
    if spec.enable_get:
        _register_get_route(router, spec)
    if spec.enable_create:
        _register_create_route(router, spec)
    if spec.enable_update:
        _register_update_route(router, spec)
    if spec.enable_delete:
        _register_delete_route(router, spec)

    # Custom action routes
    for action in spec.custom_actions:
        _register_custom_action_route(router, spec, action)

    # Nested entity routes
    for nested in spec.nested_entities:
        _register_nested_entity_routes(router, spec, nested)


# =============================================================================
# Public Factory Function
# =============================================================================


def create_template_crud_router(
    prefix: str = "",
    include_registry_info: bool = True,
) -> APIRouter:
    """
    Create a FastAPI router with CRUD endpoints for all registered template types.

    This function reads from the global TemplateCRUDRegistry and generates
    standardized CRUD endpoints for each registered template type.

    Args:
        prefix: Optional URL prefix for all routes
        include_registry_info: If True, add endpoint to list registered types

    Returns:
        Configured FastAPI router

    Example:
        # In your API setup
        from pixsim7.backend.main.services.entity_crud import create_template_crud_router

        # Register templates first (usually in startup)
        register_default_template_specs()

        # Create and mount router
        router = create_template_crud_router()
        app.include_router(router, prefix="/api/v1/game")

    Generated endpoints (for each registered spec):
        GET    /{url_prefix}              - List with pagination
        GET    /{url_prefix}/{id}         - Get by ID
        POST   /{url_prefix}              - Create (or upsert)
        PUT    /{url_prefix}/{id}         - Update
        DELETE /{url_prefix}/{id}         - Delete (soft or hard)
    """
    router = APIRouter(prefix=prefix)
    registry = get_template_crud_registry()

    # Register routes for each enabled spec
    for spec in registry.get_enabled_specs():
        _register_crud_routes(router, spec)

    # Optional: Add registry info endpoint
    if include_registry_info:
        @router.get(
            "/registry",
            summary="List registered template types",
            description="Returns information about all registered template CRUD types.",
            tags=["templates"],
        )
        async def list_template_types():
            specs = registry.list_specs()
            return {
                "template_types": [
                    {
                        "kind": s.kind,
                        "url_prefix": s.url_prefix,
                        "supports_soft_delete": s.supports_soft_delete,
                        "supports_upsert": s.supports_upsert,
                        "scope_to_owner": s.scope_to_owner,
                        "ownership": (
                            {
                                "scope": s.ownership_policy.scope.value,
                                "owner_field": s.ownership_policy.owner_field,
                                "world_field": s.ownership_policy.world_field,
                                "session_field": s.ownership_policy.session_field,
                                "requires_admin": s.ownership_policy.requires_admin,
                            }
                            if s.ownership_policy
                            else None
                        ),
                        "filterable_fields": s.filterable_fields,
                        "search_fields": s.search_fields,
                        "endpoints": {
                            "list": s.enable_list,
                            "get": s.enable_get,
                            "create": s.enable_create,
                            "update": s.enable_update,
                            "delete": s.enable_delete,
                        },
                        "custom_actions": [a.name for a in s.custom_actions],
                        "nested_entities": [n.kind for n in s.nested_entities],
                        "has_hierarchy": s.parent_field is not None,
                    }
                    for s in specs
                ],
                "count": len(specs),
            }

    return router


# =============================================================================
# Meta contract endpoint generation
# =============================================================================


def entity_specs_to_meta_sub_endpoints(
    *,
    route_prefix: str = "/api/v1/game",
    tag: str = "game_authoring",
    kinds: Optional[List[str]] = None,
    group_consolidation: Optional[Dict[str, str]] = None,
) -> list:
    """Convert registered TemplateCRUDSpecs to MetaContractEndpoint entries.

    Mirrors ``spec_to_meta_sub_endpoints`` from the lightweight registry CRUD
    module but works with the heavier ``TemplateCRUDSpec`` shape.

    Args:
        route_prefix: Base API path the entity CRUD router is mounted at.
        tag: Parent tag applied to every generated endpoint (for focus filtering).
        kinds: If set, only include specs whose ``kind`` is in this list.
               ``None`` means include all registered specs.
        group_consolidation: Maps spec domain tags (e.g. ``"npcs"``, ``"locations"``)
               to group names (e.g. ``"characters"``, ``"worlds"``).  The group
               name is combined with *tag* to form a sub-focus tag
               ``{tag}:{group}`` (e.g. ``game_authoring:characters``).  Each
               endpoint is tagged with both the parent *tag* and the sub-focus.
               When ``None``, the spec's last tag is used as-is.

    Returns:
        List of MetaContractEndpoint instances.  Call
        ``discovered_focus_groups()`` on the result to get the unique
        sub-focus tags that were emitted.
    """
    from pixsim7.backend.main.services.meta.contract_registry import MetaContractEndpoint

    consolidation = group_consolidation or {}
    registry = get_template_crud_registry()
    specs = registry.get_enabled_specs()
    if kinds is not None:
        kind_set = set(kinds)
        specs = [s for s in specs if s.kind in kind_set]

    endpoints: list = []
    for spec in specs:
        # Derive a readable noun from the kind, e.g. "gameLocation" -> "game location"
        noun = re.sub(r"([a-z])([A-Z])", r"\1 \2", spec.kind).lower()
        base = f"{route_prefix}/{spec.url_prefix}"

        # Derive sub-focus group from spec tags: ["runtime", "npcs"] → "npcs"
        # then consolidate: "npcs" → "characters" → tag "game_authoring:characters"
        domain = spec.tags[-1] if spec.tags else spec.kind
        group = consolidation.get(domain, domain)
        group_tag = f"{tag}:{group}"
        ep_tags = [tag, group_tag]

        if spec.enable_list:
            endpoints.append(MetaContractEndpoint(
                id=f"game.{spec.kind}.list",
                method="GET",
                path=base,
                summary=f"List {noun}s.",
                tags=[*ep_tags, "read"],
            ))
        if spec.enable_get:
            endpoints.append(MetaContractEndpoint(
                id=f"game.{spec.kind}.get",
                method="GET",
                path=f"{base}/{{id}}",
                summary=f"Get a single {noun} by ID.",
                tags=[*ep_tags, "read"],
            ))
        if spec.enable_create:
            endpoints.append(MetaContractEndpoint(
                id=f"game.{spec.kind}.create",
                method="POST",
                path=base,
                summary=f"Create a {noun}.",
                tags=[*ep_tags, "write"],
            ))
        if spec.enable_update:
            endpoints.append(MetaContractEndpoint(
                id=f"game.{spec.kind}.update",
                method="PUT",
                path=f"{base}/{{id}}",
                summary=f"Update a {noun}.",
                tags=[*ep_tags, "write"],
            ))
        if spec.enable_delete:
            endpoints.append(MetaContractEndpoint(
                id=f"game.{spec.kind}.delete",
                method="DELETE",
                path=f"{base}/{{id}}",
                summary=f"Delete a {noun}.",
                tags=[*ep_tags, "write"],
            ))

        # Nested entity endpoints
        for nested in spec.nested_entities:
            nested_base = f"{base}/{{id}}/{nested.url_suffix}"
            nested_noun = nested.kind
            if nested.enable_list:
                endpoints.append(MetaContractEndpoint(
                    id=f"game.{spec.kind}.{nested.kind}.list",
                    method="GET",
                    path=nested_base,
                    summary=f"List {nested_noun}s for a {spec.kind}.",
                    tags=[*ep_tags, "read"],
                ))
            if nested.enable_create:
                endpoints.append(MetaContractEndpoint(
                    id=f"game.{spec.kind}.{nested.kind}.create",
                    method="POST",
                    path=nested_base,
                    summary=f"Create a {nested_noun} under a {spec.kind}.",
                    tags=[*ep_tags, "write"],
                ))

    return endpoints
