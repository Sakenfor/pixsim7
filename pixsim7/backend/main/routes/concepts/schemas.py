"""
Generic concept response schemas.

These schemas support the unified ConceptRef system where all concept kinds
(role, part, body_region, pose, influence_region) share a common structure.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, computed_field


class ConceptResponse(BaseModel):
    """Generic concept for any kind.

    All concept kinds share this base structure. Kind-specific
    metadata goes in the `metadata` field.
    """

    kind: str = Field(description="Concept kind (e.g., 'role', 'part', 'pose')")
    id: str = Field(description="Concept ID (unique within kind)")
    label: str = Field(description="Human-readable display label")
    description: str = Field(default="", description="Longer description")
    color: str = Field(default="gray", description="Tailwind color name for UI")
    group: str = Field(default="", description="UI grouping category")
    tags: List[str] = Field(default_factory=list, description="Tags for filtering/matching")
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Kind-specific additional metadata",
    )

    @computed_field
    @property
    def ref(self) -> str:
        """Canonical ConceptRef format for linking (kind:id)."""
        return f"{self.kind}:{self.id}"


class ConceptsListResponse(BaseModel):
    """Generic response for listing concepts of a specific kind."""

    kind: str = Field(description="The concept kind returned")
    concepts: List[ConceptResponse] = Field(description="List of concepts")
    priority: List[str] = Field(
        default_factory=list,
        description="Optional priority ordering of concept IDs",
    )
    group_name: str = Field(
        default="",
        description="Display name for this kind's group (e.g., 'Composition Roles')",
    )


# ===== Role-Specific Schemas (Backward Compatibility) =====


class RoleConceptResponse(BaseModel):
    """A composition role as a concept.

    Kept for backward compatibility with existing /concepts/roles endpoint.
    New code should use the generic ConceptResponse via /concepts/{kind}.
    """

    id: str = Field(description="Role ID (e.g., 'main_character', 'environment')")
    label: str = Field(description="Human-readable label")
    description: str = Field(description="Role description")
    color: str = Field(description="Tailwind color name for UI badges")
    default_layer: int = Field(
        default=0, description="Layer order (0=background, higher=foreground)"
    )
    tags: List[str] = Field(default_factory=list, description="Tags for filtering")
    slug_mappings: List[str] = Field(
        default_factory=list,
        description="Exact tag slugs that map to this role (e.g., 'bg', 'char:hero')",
    )
    namespace_mappings: List[str] = Field(
        default_factory=list,
        description="Tag namespace prefixes that map to this role (e.g., 'npc', 'location')",
    )


class RolesListResponse(BaseModel):
    """Response containing composition roles with inference metadata.

    Kept for backward compatibility with existing /concepts/roles endpoint.
    """

    roles: List[RoleConceptResponse] = Field(description="Available composition roles")
    priority: List[str] = Field(
        description="Role IDs in priority order for conflict resolution"
    )


# ===== Helpers =====


# Group display names for different concept kinds
CONCEPT_GROUP_NAMES: Dict[str, str] = {
    "role": "Composition Roles",
    "part": "Anatomy Parts",
    "body_region": "Body Regions",
    "pose": "Poses",
    "influence_region": "Influence Regions",
}


def get_group_name(kind: str) -> str:
    """Get the display name for a concept kind's group."""
    return CONCEPT_GROUP_NAMES.get(kind, kind.replace("_", " ").title())
