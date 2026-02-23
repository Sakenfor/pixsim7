"""
Concepts API

Provides runtime access to ontology concepts for frontend.
Concept kinds are dynamically discovered from registered providers.

This endpoint supplements the build-time generated constants by:
- Including plugin-contributed concepts (which generators don't see)
- Providing priority ordering for conflict resolution
- Exposing mappings for frontend inference
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from .schemas import (
    ConceptsListResponse,
    ConceptKindInfo,
    ConceptKindsResponse,
)

router = APIRouter(prefix="/concepts", tags=["concepts"])


# =============================================================================
# Endpoints
# IMPORTANT: Static routes MUST be registered BEFORE dynamic /{kind} route
# to avoid shadowing. FastAPI matches routes in order of registration.
# =============================================================================


@router.get("", response_model=ConceptKindsResponse)
async def list_kinds():
    """
    List available concept kinds with metadata.

    Returns information about each registered concept kind including:
    - kind: The kind identifier (e.g., 'role', 'part', 'pose')
    - group_name: Display name for UI grouping
    - supports_packages: Whether the kind supports package filtering

    Use this endpoint to dynamically discover available kinds
    instead of hardcoding them in the frontend.
    """
    from pixsim7.backend.main.domain.concepts import get_registered_providers

    providers = get_registered_providers()
    kinds = [
        ConceptKindInfo(
            kind=provider.kind,
            group_name=provider.group_name,
            supports_packages=provider.supports_packages,
            include_in_labels=provider.include_in_labels,
        )
        for provider in providers.values()
    ]

    return ConceptKindsResponse(kinds=kinds)


# =============================================================================
# Generic Endpoint
# =============================================================================


@router.get("/{kind}", response_model=ConceptsListResponse)
async def list_concepts(
    kind: str,
    packages: Optional[str] = Query(
        None,
        description="Comma-separated package IDs (only applies to kinds that support packages)",
    ),
):
    """
    Get concepts of a specific kind.

    Available kinds are dynamically registered. Use GET /concepts to list them.

    Query params:
        packages: Comma-separated package IDs to filter by.
                  Only applies to kinds where supports_packages is true.
                  For other kinds, this parameter is ignored.

    Example: /api/v1/concepts/pose
    Example: /api/v1/concepts/role?packages=core.base
    """
    from pixsim7.backend.main.domain.concepts import get_provider, get_all_kinds

    provider = get_provider(kind)
    if not provider:
        valid_kinds = ", ".join(get_all_kinds())
        raise HTTPException(
            status_code=404,
            detail=f"Unknown concept kind: '{kind}'. Valid kinds: {valid_kinds}",
        )

    # Parse package IDs only for providers that support package filtering.
    package_ids = None
    if provider.supports_packages and packages:
        package_ids = [p.strip() for p in packages.split(",") if p.strip()]

    concepts = provider.get_concepts(package_ids)
    priority = provider.get_priority(package_ids)

    return ConceptsListResponse(
        kind=kind,
        concepts=concepts,
        priority=priority,
        group_name=provider.group_name,
    )
