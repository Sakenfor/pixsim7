"""
Concepts API

Provides runtime access to ontology concepts for frontend.
Includes composition roles with full metadata for role inference.

This endpoint supplements the build-time generated constants by:
- Including plugin-contributed roles (which generators don't see)
- Providing role priority for conflict resolution
- Exposing slug/namespace mappings for frontend inference
"""
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

from pixsim7.backend.main.domain.composition import (
    get_available_roles,
    CompositionRoleDefinition,
)
from pixsim7.backend.main.shared.composition import COMPOSITION_ROLE_PRIORITY

router = APIRouter(prefix="/concepts", tags=["concepts"])


# ===== Response Schemas =====

class RoleConceptResponse(BaseModel):
    """A composition role as a concept."""
    id: str = Field(description="Role ID (e.g., 'main_character', 'environment')")
    label: str = Field(description="Human-readable label")
    description: str = Field(description="Role description")
    color: str = Field(description="Tailwind color name for UI badges")
    default_layer: int = Field(default=0, description="Layer order (0=background, higher=foreground)")
    tags: List[str] = Field(default_factory=list, description="Tags for filtering")
    slug_mappings: List[str] = Field(
        default_factory=list,
        description="Exact tag slugs that map to this role (e.g., 'bg', 'char:hero')"
    )
    namespace_mappings: List[str] = Field(
        default_factory=list,
        description="Tag namespace prefixes that map to this role (e.g., 'npc', 'location')"
    )

    @classmethod
    def from_domain(cls, role: CompositionRoleDefinition) -> "RoleConceptResponse":
        return cls(
            id=role.id,
            label=role.label,
            description=role.description,
            color=role.color,
            default_layer=role.default_layer,
            tags=list(role.tags),
            slug_mappings=list(role.slug_mappings),
            namespace_mappings=list(role.namespace_mappings),
        )


class RolesListResponse(BaseModel):
    """Response containing composition roles with inference metadata."""
    roles: List[RoleConceptResponse] = Field(description="Available composition roles")
    priority: List[str] = Field(description="Role IDs in priority order for conflict resolution")


# ===== Endpoints =====

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
        roles=[RoleConceptResponse.from_domain(r) for r in roles],
        priority=list(COMPOSITION_ROLE_PRIORITY),
    )
