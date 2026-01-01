"""
Shared image composition schemas.

These schemas define the canonical multi-image composition format used across
fusion, image editing, and prompt blocks.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, AliasChoices, ConfigDict, computed_field, field_validator

from pixsim7.backend.main.shared.schemas.entity_ref import AssetRef
from pixsim7.backend.main.shared.composition import normalize_composition_role
from pixsim7.backend.main.domain.ontology.concept_ref import ConceptRef


class CompositionAsset(BaseModel):
    """Single asset in an image composition."""
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "asset_id", "assetId", "asset_ref"),
        description="Asset reference (EntityRef, asset:id string, or raw id)",
    )
    url: Optional[str] = Field(
        default=None,
        description="External or provider URL (used when asset ref is unavailable)",
    )
    role: Optional[str] = Field(
        default=None,
        description="Composition role id (e.g., main_character, environment)",
    )
    intent: Optional[str] = Field(
        default=None,
        pattern="^(generate|preserve|modify|add|remove)$",
        description="How this asset should be used relative to the intent",
    )
    priority: Optional[int] = Field(
        default=None,
        description="Priority for conflict resolution (higher wins)",
    )
    layer: Optional[int] = Field(
        default=None,
        description="Composition layer (0=background, higher=foreground)",
    )
    ref_name: Optional[str] = Field(
        default=None,
        description="Optional reference token name for prompt injection",
    )

    # Influence hints (for lineage tracking in multi-image edits)
    influence_type: Optional[str] = Field(
        default=None,
        pattern="^(content|style|structure|mask|blend|replacement|reference)$",
        description="Expected influence: content, style, structure, mask, blend, replacement, reference",
    )
    influence_region: Optional[str] = Field(
        default=None,
        description="Target region: full, foreground, background, subject:<id>, mask:<label>",
    )

    # Ontology-aligned hints
    character_id: Optional[str] = None
    location_id: Optional[str] = None
    pose_id: Optional[str] = None
    expression_id: Optional[str] = None
    camera_view_id: Optional[str] = None
    camera_framing_id: Optional[str] = None
    surface_type: Optional[str] = None
    prop_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # Provider-specific extensions
    provider_params: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return normalize_composition_role(str(v))

    @computed_field
    @property
    def role_concept(self) -> Optional[ConceptRef]:
        """Get role as typed ConceptRef (kind='role').

        Provides typed access to role for code that uses the unified ConceptRef system.
        Returns None if role is not set.
        """
        if self.role:
            return ConceptRef(kind="role", id=self.role)
        return None
