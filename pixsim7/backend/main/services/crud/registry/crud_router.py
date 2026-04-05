"""
Generic CRUD Router Factory for DB-backed registries.

Generates standard GET (list), POST (create), PATCH (update) FastAPI routes
from a RegistryCrudSpec. The same spec can be used by the meta contract
builder to generate discovery sub_endpoints — single source of truth.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, List, Optional, Type

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import get_current_user, get_db


@dataclass
class RegistryCrudSpec:
    """Specification for auto-generating CRUD routes on a registry.

    Also usable by meta contract builders to generate sub_endpoints.
    """

    # Required fields first
    prefix: str  # e.g. "/meta/authoring-modes"
    tag: str  # e.g. "authoring-modes"
    registry: Any  # SimpleRegistry instance with list_all(), get(), persist_mode()
    response_model: Any = None  # Pydantic BaseModel class

    # Optional config
    summary_noun: str = ""  # e.g. "authoring mode" (for auto-generated summaries)
    create_request_model: Optional[Type[BaseModel]] = None
    update_request_model: Optional[Type[BaseModel]] = None

    # Converters
    to_response: Optional[Callable] = None
    from_create_request: Optional[Callable] = None
    apply_update_request: Optional[Callable] = None

    # Hooks
    before_create: Optional[Callable[..., Awaitable]] = None
    before_update: Optional[Callable[..., Awaitable]] = None
    after_create: Optional[Callable[..., Awaitable]] = None
    after_update: Optional[Callable[..., Awaitable]] = None

    # Auth
    require_admin: bool = False

    # Audit (opt-in)
    audit_config: Any = None  # AuditConfig from services.audit

    # Disable specific actions
    disable_list: bool = False
    disable_create: bool = False
    disable_update: bool = False


async def _registry_audit_created(
    db: AsyncSession, spec: RegistryCrudSpec, item: Any, user: Any,
) -> None:
    if not (spec.audit_config and spec.audit_config.enabled):
        return
    from pixsim7.backend.main.services.audit import AuditService
    cfg = spec.audit_config
    await AuditService(db).record(
        domain=cfg.domain, entity_type=cfg.entity_type,
        entity_id=str(getattr(item, 'id', '')),
        entity_label=str(getattr(item, cfg.label_field, '') or ''),
        action="created",
    )
    await db.commit()


async def _registry_audit_updated(
    db: AsyncSession, spec: RegistryCrudSpec, existing: Any, updated: Any,
    request: BaseModel, user: Any,
) -> None:
    if not (spec.audit_config and spec.audit_config.enabled):
        return
    from pixsim7.backend.main.services.audit import AuditService
    cfg = spec.audit_config
    req_fields = list(request.model_fields_set) if hasattr(request, 'model_fields_set') else []
    audit = AuditService(db)
    entries = await audit.record_diff(
        domain=cfg.domain, entity_type=cfg.entity_type,
        entity_id=str(getattr(updated, 'id', '')),
        entity_label=str(getattr(updated, cfg.label_field, '') or ''),
        old_obj=existing, new_obj=updated,
        fields=req_fields,
    )
    if not entries:
        # No field-level diffs detected — emit a generic "updated" entry
        await audit.record(
            domain=cfg.domain, entity_type=cfg.entity_type,
            entity_id=str(getattr(updated, 'id', '')),
            entity_label=str(getattr(updated, cfg.label_field, '') or ''),
            action="updated",
        )
    await db.commit()


def mount_registry_crud(router: APIRouter, spec: RegistryCrudSpec) -> None:
    """Mount GET (list), POST (create), PATCH (update) routes on the router."""

    noun = spec.summary_noun or spec.tag.replace("-", " ")

    # Capture spec fields in closures to avoid Pydantic forward-ref issues.
    # FastAPI can't resolve `spec.create_request_model` as a type annotation
    # at route-registration time, so we build endpoints explicitly.

    if not spec.disable_list:
        async def _list_items(current_user=Depends(get_current_user)):
            items = spec.registry.list_all()
            if spec.to_response:
                return [spec.to_response(item) for item in items]
            return items

        router.add_api_route(
            spec.prefix,
            _list_items,
            methods=["GET"],
            response_model=List[spec.response_model],
            summary=f"List all {noun}s",
            tags=[spec.tag],
        )

    if not spec.disable_create and spec.create_request_model and spec.from_create_request:
        # Build a typed endpoint function dynamically
        CreateModel = spec.create_request_model

        async def _create_item(
            request: BaseModel,
            db: AsyncSession = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            item_id = getattr(request, "id", None)
            if item_id and spec.registry.has(item_id):
                raise HTTPException(
                    status_code=409,
                    detail=f"{noun.title()} '{item_id}' already exists",
                )
            item = spec.from_create_request(request)
            if spec.before_create:
                await spec.before_create(item, db)
            if hasattr(spec.registry, "persist_mode"):
                await spec.registry.persist_mode(db, item)
            else:
                spec.registry.register_item(item)
            if spec.after_create:
                await spec.after_create(item, db)
            await _registry_audit_created(db, spec, item, current_user)
            return spec.to_response(item) if spec.to_response else item

        # Patch the annotation so FastAPI sees the correct request model
        _create_item.__annotations__["request"] = CreateModel

        router.add_api_route(
            spec.prefix,
            _create_item,
            methods=["POST"],
            response_model=spec.response_model,
            summary=f"Create a new {noun}",
            tags=[spec.tag],
        )

    if not spec.disable_update and spec.update_request_model and spec.apply_update_request:
        UpdateModel = spec.update_request_model

        async def _update_item(
            item_id: str,
            request: BaseModel,
            db: AsyncSession = Depends(get_db),
            current_user=Depends(get_current_user),
        ):
            existing = spec.registry.get(item_id)
            if not existing:
                raise HTTPException(
                    status_code=404,
                    detail=f"{noun.title()} '{item_id}' not found",
                )
            updated = spec.apply_update_request(existing, request)
            if spec.before_update:
                await spec.before_update(existing, updated, db)
            if hasattr(spec.registry, "persist_mode"):
                await spec.registry.persist_mode(db, updated)
            else:
                key = spec.registry._get_item_key(updated)
                spec.registry.register(key, updated)
            if spec.after_update:
                await spec.after_update(updated, db)
            await _registry_audit_updated(db, spec, existing, updated, request, current_user)
            return spec.to_response(updated) if spec.to_response else updated

        _update_item.__annotations__["request"] = UpdateModel

        router.add_api_route(
            f"{spec.prefix}/{{item_id}}",
            _update_item,
            methods=["PATCH"],
            response_model=spec.response_model,
            summary=f"Update a {noun}",
            tags=[spec.tag],
        )


def spec_to_meta_sub_endpoints(spec: RegistryCrudSpec) -> list:
    """Convert a RegistryCrudSpec to MetaContractEndpoint-compatible dicts."""
    from pixsim7.backend.main.services.meta.contract_registry import MetaContractEndpoint

    noun = spec.summary_noun or spec.tag.replace("-", " ")
    endpoints = []

    if not spec.disable_list:
        endpoints.append(MetaContractEndpoint(
            id=f"{spec.tag}.list",
            method="GET",
            path=f"/api/v1{spec.prefix}",
            summary=f"List all {noun}s.",
            tags=[spec.tag, "read"],
        ))

    if not spec.disable_create:
        endpoints.append(MetaContractEndpoint(
            id=f"{spec.tag}.create",
            method="POST",
            path=f"/api/v1{spec.prefix}",
            summary=f"Create a new {noun}.",
            input_schema=spec.create_request_model.model_json_schema() if spec.create_request_model else None,
            tags=[spec.tag, "write"],
        ))

    if not spec.disable_update:
        endpoints.append(MetaContractEndpoint(
            id=f"{spec.tag}.update",
            method="PATCH",
            path=f"/api/v1{spec.prefix}/{{item_id}}",
            summary=f"Update a {noun}.",
            input_schema=spec.update_request_model.model_json_schema() if spec.update_request_model else None,
            tags=[spec.tag, "write"],
        ))

    return endpoints
