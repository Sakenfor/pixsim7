"""
Template CRUD Router Factory - Auto-generates API routes from registry.

Creates FastAPI routers with standardized CRUD endpoints for all registered
template types.

Usage:
    # In api/v1/__init__.py or similar
    from pixsim7.backend.main.services.templates import create_template_crud_router

    templates_router = create_template_crud_router()
    app.include_router(templates_router, prefix="/api/v1/game")
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Type
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field, create_model
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_db, get_current_user
from pixsim7.backend.main.domain.user import User

from .crud_registry import TemplateCRUDSpec, NestedEntitySpec, CustomAction, get_template_crud_registry
from .crud_service import TemplateCRUDService, NestedEntityService, CRUDValidationError


# =============================================================================
# Generic Response Models
# =============================================================================


class PaginatedResponse(BaseModel):
    """Generic paginated list response."""
    items: List[Any]
    total: int
    limit: int
    offset: int
    has_more: bool


class DeleteResponse(BaseModel):
    """Response for delete operations."""
    success: bool
    message: str


class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str


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


# =============================================================================
# Route Registration
# =============================================================================


def _register_list_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register GET list endpoint."""
    response_model = spec.list_response_schema or create_list_response_model(spec)

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
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
        _spec: TemplateCRUDSpec = spec,
    ):
        # Build owner ID if scoped
        owner_id = current_user.id if _spec.scope_to_owner else None
        service = TemplateCRUDService(db, _spec, owner_id=owner_id)

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
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
        _spec: TemplateCRUDSpec = spec,
    ):
        owner_id = current_user.id if _spec.scope_to_owner else None
        service = TemplateCRUDService(db, _spec, owner_id=owner_id)
        item = await service.get(entity_id)
        if not item:
            raise HTTPException(status_code=404, detail=f"{_spec.kind} not found")
        # Apply transformation
        return await service.transform_response(item)


def _register_create_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register POST create endpoint."""
    request_model = spec.create_schema or spec.model
    response_model = spec.response_schema or spec.model

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
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
        _spec: TemplateCRUDSpec = spec,
    ):
        owner_id = current_user.id if _spec.scope_to_owner else None
        service = TemplateCRUDService(db, _spec, owner_id=owner_id)
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
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
        _spec: TemplateCRUDSpec = spec,
    ):
        owner_id = current_user.id if _spec.scope_to_owner else None
        service = TemplateCRUDService(db, _spec, owner_id=owner_id)
        try:
            item = await service.update(entity_id, data)
            if not item:
                raise HTTPException(status_code=404, detail=f"{_spec.kind} not found")
            return await service.transform_response(item)
        except CRUDValidationError as e:
            raise HTTPException(status_code=422, detail=e.message)


def _register_delete_route(router: APIRouter, spec: TemplateCRUDSpec) -> None:
    """Register DELETE endpoint."""

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
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user),
        _spec: TemplateCRUDSpec = spec,
    ):
        owner_id = current_user.id if _spec.scope_to_owner else None
        service = TemplateCRUDService(db, _spec, owner_id=owner_id)

        if cascade and _spec.nested_entities:
            success = await service.delete_with_nested(entity_id, hard=hard)
        else:
            success = await service.delete(entity_id, hard=hard)

        if not success:
            raise HTTPException(status_code=404, detail=f"{_spec.kind} not found")
        return DeleteResponse(
            success=True,
            message=f"{_spec.kind} {'deleted' if hard else 'deactivated'} successfully"
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
            _spec: TemplateCRUDSpec = spec,
            _action: CustomAction = action,
        ):
            return await _action.handler(
                db=db,
                user=current_user,
                entity_id=entity_id,
                data=data,
                spec=_spec,
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
            _spec: TemplateCRUDSpec = spec,
            _action: CustomAction = action,
        ):
            return await _action.handler(
                db=db,
                user=current_user,
                entity_id=entity_id,
                data=data,
                spec=_spec,
            )


def _register_nested_entity_routes(
    router: APIRouter,
    spec: TemplateCRUDSpec,
    nested: NestedEntitySpec,
) -> None:
    """Register CRUD routes for nested entities."""
    base_path = f"/{spec.url_prefix}/{{parent_id}}/{nested.url_suffix}"

    if nested.enable_list:
        @router.get(
            base_path,
            summary=f"List {nested.kind} under {spec.kind}",
            tags=spec.tags,
        )
        async def list_nested(
            parent_id: str,
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)
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
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)
            item = await service.get(entity_id)
            if not item:
                raise HTTPException(status_code=404, detail=f"{_nested.kind} not found")
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
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)
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
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)
            item = await service.update(entity_id, data)
            if not item:
                raise HTTPException(status_code=404, detail=f"{_nested.kind} not found")
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
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)
            success = await service.delete(entity_id)
            if not success:
                raise HTTPException(status_code=404, detail=f"{_nested.kind} not found")
            return DeleteResponse(success=True, message=f"{_nested.kind} deleted")

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
            db: AsyncSession = Depends(get_db),
            current_user: User = Depends(get_current_user),
            _spec: TemplateCRUDSpec = spec,
            _nested: NestedEntitySpec = nested,
        ):
            parsed_parent_id = _spec.id_parser(parent_id)
            service = NestedEntityService(db, _nested, parent_id, parsed_parent_id)

            # Expect data in format {"items": [...]} or just a list
            items = data.get("items", data) if isinstance(data, dict) else data
            if not isinstance(items, list):
                items = [items] if items else []

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
        from pixsim7.backend.main.services.templates import create_template_crud_router

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
            "/templates/registry",
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
