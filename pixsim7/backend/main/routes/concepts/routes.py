"""
Concepts API

Provides runtime access to ontology concepts for frontend.
Supports multiple concept kinds: role, part, body_region, pose, influence_region.

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
    RoleConceptResponse,
    RolesListResponse,
    get_group_name,
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


# ===== Endpoints =====
# IMPORTANT: Static routes MUST be registered BEFORE dynamic /{kind} route
# to avoid shadowing. FastAPI matches routes in order of registration.


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


# ===== Generic Endpoint =====
# IMPORTANT: This MUST be registered AFTER static routes like /roles


@router.get("/{kind}", response_model=ConceptsListResponse)
async def list_concepts(
    kind: str,
    packages: Optional[str] = Query(
        None,
        description="Comma-separated package IDs (only applies to 'role' kind)",
    ),
):
    """
    Get concepts of a specific kind.

    Kinds:
    - role: Composition roles (main_character, environment, etc.)
    - part: Anatomy parts (face, hands, torso, etc.)
    - body_region: Body regions (chest, groin, back, etc.)
    - pose: Poses (standing_neutral, kissing, etc.)
    - influence_region: Built-in influence regions (foreground, background, full, subject)

    Query params:
        packages: Comma-separated package IDs to filter by.
                  Only applies to kinds that support packages (currently: role).
                  For other kinds, this parameter is ignored.

    Example: /api/v1/concepts/pose
    Example: /api/v1/concepts/role?packages=core.base
    """
    from pixsim7.backend.main.domain.concepts import get_concept_provider

    provider = get_concept_provider(kind)
    if not provider:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown concept kind: '{kind}'. "
            f"Valid kinds: role, part, body_region, pose, influence_region",
        )

    # Parse package IDs if provided
    package_ids = None
    if packages:
        package_ids = [p.strip() for p in packages.split(",") if p.strip()]

    concepts = provider.get_concepts(package_ids)
    priority = provider.get_priority()
    group_name = provider.get_group_name()

    return ConceptsListResponse(
        kind=kind,
        concepts=concepts,
        priority=priority,
        group_name=group_name,
    )
