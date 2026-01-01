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

from pixsim7.backend.main.domain.composition import (
    get_available_roles,
    CompositionRoleDefinition,
)
from pixsim7.backend.main.shared.composition import COMPOSITION_ROLE_PRIORITY

from .schemas import (
    ConceptResponse,
    ConceptsListResponse,
    ConceptKindInfo,
    ConceptKindsResponse,
    RoleConceptResponse,
    RolesListResponse,
)

router = APIRouter(prefix="/concepts", tags=["concepts"])


def _role_to_concept_response(role: CompositionRoleDefinition) -> RoleConceptResponse:
    """Convert domain role to response schema."""
    return RoleConceptResponse(
        id=role.id,
        label=role.label,
        description=role.description,
        color=role.color,
        default_layer=role.default_layer,
        tags=list(role.tags),
        slug_mappings=list(role.slug_mappings),
        namespace_mappings=list(role.namespace_mappings),
    )


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


@router.get("/body_region", response_model=ConceptsListResponse, deprecated=True)
async def list_body_regions_deprecated(
    packages: Optional[str] = Query(None),
):
    """
    DEPRECATED: Use /concepts/part instead.

    Body regions have been merged into the 'part' kind.
    This endpoint returns part concepts for backward compatibility.
    """
    from pixsim7.backend.main.domain.concepts import get_provider

    provider = get_provider("part")
    if not provider:
        raise HTTPException(status_code=500, detail="Part provider not found")

    package_ids = None
    if packages:
        package_ids = [p.strip() for p in packages.split(",") if p.strip()]

    concepts = provider.get_concepts(package_ids)

    return ConceptsListResponse(
        kind="body_region",  # Keep original kind for compat
        concepts=concepts,
        priority=provider.get_priority(),
        group_name="Body Regions (deprecated)",
    )


@router.get("/roles", response_model=RolesListResponse)
async def list_roles(
    packages: Optional[str] = None,
):
    """
    Get composition roles with full metadata for frontend inference.

    Includes:
    - All roles from core + active packages (or all if no filter)
    - Slug/namespace mappings for inferring role from tags
    - Priority list for conflict resolution

    This endpoint provides plugin roles that build-time generators cannot include.
    Frontend should merge with generated core constants and dedupe by id.

    Query params:
        packages: Comma-separated package IDs to filter by (e.g., 'core.base,pov.first_person')
                  If omitted, returns roles from all registered packages.

    Example: /api/v1/concepts/roles?packages=core.base,pov.first_person
    """
    active_ids = None
    if packages:
        active_ids = [p.strip() for p in packages.split(",") if p.strip()]

    roles = get_available_roles(active_ids)

    return RolesListResponse(
        roles=[_role_to_concept_response(r) for r in roles],
        priority=list(COMPOSITION_ROLE_PRIORITY),
    )


# =============================================================================
# Generic Endpoint
# IMPORTANT: This MUST be registered AFTER static routes like /roles
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

    # Parse package IDs if provided
    package_ids = None
    if packages:
        package_ids = [p.strip() for p in packages.split(",") if p.strip()]

    concepts = provider.get_concepts(package_ids)
    priority = provider.get_priority()

    return ConceptsListResponse(
        kind=kind,
        concepts=concepts,
        priority=priority,
        group_name=provider.group_name,
    )
