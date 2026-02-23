"""
Generic concept response schemas.

These schemas support the unified ConceptRef system where all concept kinds
share a common structure. Group names and metadata come from providers.
"""
from typing import Any, Dict, List
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


# =============================================================================
# Kinds Metadata (for GET /concepts endpoint)
# =============================================================================


class ConceptKindInfo(BaseModel):
    """Metadata about a concept kind."""

    kind: str = Field(description="Concept kind identifier")
    group_name: str = Field(description="Display name for UI grouping")
    supports_packages: bool = Field(
        default=False,
        description="Whether this kind supports package filtering",
    )
    include_in_labels: bool = Field(
        default=True,
        description="Whether to include in label autocomplete suggestions",
    )


class ConceptKindsResponse(BaseModel):
    """Response from GET /concepts listing available kinds."""

    kinds: List[ConceptKindInfo] = Field(description="Available concept kinds")
