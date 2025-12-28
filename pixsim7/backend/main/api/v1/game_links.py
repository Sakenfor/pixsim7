"""
Game Links API - Template to Runtime Resolution

Exposes the ObjectLink resolution system to the frontend game runtime,
enabling template-based entity references that resolve to runtime entities
based on context (location, time, etc.).
"""
from __future__ import annotations

from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import DbSession
from pixsim7.backend.main.services.links.template_resolver import (
    resolve_template_to_runtime,
)

router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================


class ResolveTemplateRequest(BaseModel):
    """Request to resolve a template entity to its runtime counterpart."""

    template_kind: str = Field(
        ...,
        description="Template entity kind (e.g., 'characterInstance', 'itemTemplate')",
        examples=["characterInstance"],
    )
    template_id: str = Field(
        ...,
        description="Template entity ID (usually UUID)",
        examples=["abc-123-uuid"],
    )
    context: Optional[Dict[str, Any]] = Field(
        None,
        description="Runtime context for activation-based resolution (e.g., location, time)",
        examples=[{"location.zone": "downtown", "time.period": "night"}],
    )


class ResolveTemplateResponse(BaseModel):
    """Response from template resolution."""

    resolved: bool = Field(
        ...,
        description="Whether resolution succeeded",
    )
    runtime_kind: Optional[str] = Field(
        None,
        description="Runtime entity kind (e.g., 'npc', 'item')",
    )
    runtime_id: Optional[int] = Field(
        None,
        description="Runtime entity ID",
    )
    template_kind: str = Field(
        ...,
        description="Echo of requested template kind",
    )
    template_id: str = Field(
        ...,
        description="Echo of requested template ID",
    )


class ResolveBatchItem(BaseModel):
    """Single item in a batch resolution request."""

    template_kind: str
    template_id: str
    context: Optional[Dict[str, Any]] = None


class ResolveBatchRequest(BaseModel):
    """Request to resolve multiple template references in one call."""

    refs: List[ResolveBatchItem] = Field(
        ...,
        description="List of template references to resolve",
        max_length=50,  # Prevent abuse
    )
    shared_context: Optional[Dict[str, Any]] = Field(
        None,
        description="Context applied to all refs (merged with per-ref context)",
    )


class ResolveBatchResponse(BaseModel):
    """Response from batch resolution."""

    results: Dict[str, ResolveTemplateResponse] = Field(
        ...,
        description="Results keyed by 'templateKind:templateId'",
    )
    resolved_count: int = Field(
        ...,
        description="Number of successfully resolved refs",
    )
    total_count: int = Field(
        ...,
        description="Total number of refs requested",
    )


# =============================================================================
# Runtime Kind Mapping
# =============================================================================

# Maps template kinds to their expected runtime kinds
TEMPLATE_TO_RUNTIME_KIND: Dict[str, str] = {
    "characterInstance": "npc",
    "itemTemplate": "item",
    "propTemplate": "prop",
    "locationTemplate": "location",
}


def get_runtime_kind(template_kind: str) -> Optional[str]:
    """Get the expected runtime kind for a template kind."""
    return TEMPLATE_TO_RUNTIME_KIND.get(template_kind)


# =============================================================================
# API Endpoints
# =============================================================================


@router.post(
    "/resolve",
    response_model=ResolveTemplateResponse,
    summary="Resolve template to runtime entity",
    description="""
Resolve a template entity reference to its linked runtime entity.

Uses the ObjectLink system to find the highest-priority active link
for the given template, considering activation conditions based on
the provided context (location, time of day, etc.).

Example use cases:
- Resolve a CharacterInstance to an NPC ID for interaction
- Find which NPC represents a character in a specific location
- Get the runtime item for an item template
""",
)
async def resolve_template(
    request: ResolveTemplateRequest,
    db: DbSession,
) -> ResolveTemplateResponse:
    """Resolve a single template reference to runtime entity."""
    try:
        runtime_id = await resolve_template_to_runtime(
            db,
            request.template_kind,
            request.template_id,
            context=request.context,
        )

        if runtime_id is None:
            return ResolveTemplateResponse(
                resolved=False,
                runtime_kind=None,
                runtime_id=None,
                template_kind=request.template_kind,
                template_id=request.template_id,
            )

        return ResolveTemplateResponse(
            resolved=True,
            runtime_kind=get_runtime_kind(request.template_kind),
            runtime_id=runtime_id,
            template_kind=request.template_kind,
            template_id=request.template_id,
        )

    except ValueError as e:
        # No mapping registered, etc.
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/resolve-batch",
    response_model=ResolveBatchResponse,
    summary="Batch resolve multiple templates",
    description="""
Resolve multiple template references in a single request.

Useful for:
- Scene role bindings (resolve all character roles at once)
- Prefetching NPC IDs for a location
- Bulk interaction target resolution

Each ref can have its own context, or use shared_context for common values.
Per-ref context is merged with shared_context (per-ref takes precedence).
""",
)
async def resolve_batch(
    request: ResolveBatchRequest,
    db: DbSession,
) -> ResolveBatchResponse:
    """Resolve multiple template references in batch."""
    results: Dict[str, ResolveTemplateResponse] = {}
    resolved_count = 0

    for ref in request.refs:
        key = f"{ref.template_kind}:{ref.template_id}"

        # Merge contexts (per-ref overrides shared)
        context = {**(request.shared_context or {}), **(ref.context or {})}
        if not context:
            context = None

        try:
            runtime_id = await resolve_template_to_runtime(
                db,
                ref.template_kind,
                ref.template_id,
                context=context,
            )

            resolved = runtime_id is not None
            if resolved:
                resolved_count += 1

            results[key] = ResolveTemplateResponse(
                resolved=resolved,
                runtime_kind=get_runtime_kind(ref.template_kind) if resolved else None,
                runtime_id=runtime_id,
                template_kind=ref.template_kind,
                template_id=ref.template_id,
            )

        except ValueError:
            # No mapping registered - mark as not resolved
            results[key] = ResolveTemplateResponse(
                resolved=False,
                runtime_kind=None,
                runtime_id=None,
                template_kind=ref.template_kind,
                template_id=ref.template_id,
            )

    return ResolveBatchResponse(
        results=results,
        resolved_count=resolved_count,
        total_count=len(request.refs),
    )


@router.get(
    "/mappings",
    summary="List available template-runtime mappings",
    description="Returns the list of registered template→runtime mapping types.",
)
async def list_mappings() -> Dict[str, Any]:
    """List available template-runtime mappings."""
    from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry

    registry = get_mapping_registry()
    mappings = registry.list_mappings()

    return {
        "mappings": list(mappings.keys()),
        "template_to_runtime": TEMPLATE_TO_RUNTIME_KIND,
    }
