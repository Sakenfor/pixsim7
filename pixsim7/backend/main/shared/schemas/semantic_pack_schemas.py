"""
Semantic Pack schemas for shareable prompt semantics bundles

Semantic Packs allow players/creators to bundle ActionBlocks, prompt families,
and parser hint configuration into versioned, shareable packages.
"""
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum


class SemanticPackStatus(str, Enum):
    """Status of a semantic pack"""
    DRAFT = "draft"
    PUBLISHED = "published"
    DEPRECATED = "deprecated"


class PromptRoleDefinitionSchema(BaseModel):
    """Role definition for dynamic prompt role registration."""
    id: str = Field(..., description="Role ID (e.g., 'character', 'camera')")
    label: Optional[str] = Field(None, description="Human-readable label")
    description: Optional[str] = Field(None, description="Role description")
    keywords: List[str] = Field(default_factory=list, description="Keywords for parser matching")
    aliases: List[str] = Field(default_factory=list, description="Alias role IDs")
    priority: Optional[int] = Field(None, description="Role priority for classification")


class SemanticPackManifest(BaseModel):
    """
    Manifest for a Semantic Pack.

    Contains metadata, parser hints, and references to ActionBlocks/PromptFamilies.
    The manifest itself is lightweight - actual content stays in their existing tables.
    """
    id: str = Field(..., description="Pack ID (e.g. 'minotaur_city_pack')")
    version: str = Field(..., description="Semantic version (e.g. '0.1.0')")
    label: str = Field(..., description="Human-readable label")
    description: Optional[str] = Field(None, description="Pack description")
    author: Optional[str] = Field(None, description="Pack author")
    created_at: Optional[datetime] = Field(None, description="Creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")

    # Compatibility
    ontology_version_min: Optional[str] = Field(
        None,
        description="Minimum compatible ontology version"
    )
    ontology_version_max: Optional[str] = Field(
        None,
        description="Maximum compatible ontology version"
    )

    # Tags/metadata (for discovery and filters)
    tags: List[str] = Field(
        default_factory=list,
        description="Tags for discovery and filtering"
    )

    # Parser hints (keywords/synonyms)
    parser_hints: Dict[str, List[str]] = Field(
        default_factory=dict,
        description=(
            "Role/attribute-specific keywords keyed by ontology-aligned IDs. "
            "Role hints must use 'role:<name>' keys (e.g. 'role:character', "
            "'role:action') to augment classification. Other keys should be "
            "ontology IDs or attribute IDs (e.g. 'camera:angle_pov', "
            "'phys:size:large') and are reserved for higher-level tools."
        ),
    )

    # Dynamic roles and operation profiles
    roles: List[PromptRoleDefinitionSchema] = Field(
        default_factory=list,
        description="Dynamic role definitions provided by this pack",
    )
    operation_profiles: Dict[str, Dict[str, str]] = Field(
        default_factory=dict,
        description="Operation mode -> role intent mapping overrides",
    )

    # Links to content (ActionBlocks, PromptFamilies)
    action_block_ids: List[str] = Field(
        default_factory=list,
        description="ActionBlock.block_id values referenced by this pack"
    )
    prompt_family_slugs: List[str] = Field(
        default_factory=list,
        description="PromptFamily slugs referenced by this pack"
    )

    status: SemanticPackStatus = Field(
        default=SemanticPackStatus.DRAFT,
        description="Pack status (draft/published/deprecated)"
    )

    extra: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional flexible metadata"
    )

    class Config:
        use_enum_values = True


class SemanticPackCreateRequest(BaseModel):
    """Request schema for creating or updating a semantic pack"""
    id: str
    version: str
    label: str
    description: Optional[str] = None
    author: Optional[str] = None

    ontology_version_min: Optional[str] = None
    ontology_version_max: Optional[str] = None

    tags: List[str] = Field(default_factory=list)
    parser_hints: Dict[str, List[str]] = Field(default_factory=dict)
    roles: List[PromptRoleDefinitionSchema] = Field(default_factory=list)
    operation_profiles: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    action_block_ids: List[str] = Field(default_factory=list)
    prompt_family_slugs: List[str] = Field(default_factory=list)
    status: SemanticPackStatus = SemanticPackStatus.DRAFT
    extra: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class SemanticPackListRequest(BaseModel):
    """Request schema for listing semantic packs with filters"""
    status: Optional[SemanticPackStatus] = None
    tag: Optional[str] = None
    author: Optional[str] = None
    ontology_version: Optional[str] = None
    limit: int = Field(50, ge=1, le=100)
    offset: int = Field(0, ge=0)

    class Config:
        use_enum_values = True


class SemanticPackPublishRequest(BaseModel):
    """Request schema for publishing a semantic pack"""
    # Future: can add validation flags here
    pass


class SemanticPackExportResponse(BaseModel):
    """Response schema for pack export with full content"""
    manifest: SemanticPackManifest
    # Future: include full ActionBlock and PromptFamily data
    action_blocks: List[Dict[str, Any]] = Field(default_factory=list)
    prompt_families: List[Dict[str, Any]] = Field(default_factory=list)
