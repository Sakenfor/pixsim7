"""
Semantic Pack domain model - Database-backed shareable prompt semantics bundles

Semantic Packs bundle ActionBlocks, prompt families, and parser hint configuration
into versioned, shareable packages that players/creators can distribute.
"""
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON, Text, Index
from typing import Optional, Dict, Any, List
from datetime import datetime


class SemanticPackDB(SQLModel, table=True):
    """
    Database-backed semantic pack for shareable prompt semantics.

    Stores the manifest and parser hints. References ActionBlocks and PromptFamilies
    by ID/slug - does not store copies of their data.
    """
    __tablename__ = "semantic_packs"

    # Primary Identity
    id: str = Field(
        primary_key=True,
        max_length=100,
        description="Pack ID (e.g., 'minotaur_city_pack')"
    )

    version: str = Field(
        max_length=20,
        description="Semantic version (e.g., '0.1.0')"
    )

    label: str = Field(
        max_length=200,
        description="Human-readable label"
    )

    description: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="Pack description"
    )

    author: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Pack author"
    )

    # Compatibility
    ontology_version_min: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Minimum compatible ontology version"
    )

    ontology_version_max: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Maximum compatible ontology version"
    )

    # Tags/metadata (for discovery and filters)
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Tags for discovery and filtering"
    )

    # Parser hints (keywords/synonyms)
    parser_hints: Dict[str, List[str]] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description=(
            "Role/attribute-specific keywords merged into parser. "
            "Format: { 'role:character': ['minotaur', 'werecow'], ... }"
        )
    )

    # Links to content (ActionBlocks, PromptFamilies)
    action_block_ids: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="ActionBlock.block_id values referenced by this pack"
    )

    prompt_family_slugs: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="PromptFamily slugs referenced by this pack"
    )

    # Status
    status: str = Field(
        default="draft",
        max_length=20,
        index=True,
        description="Pack status: draft, published, deprecated"
    )

    # Metadata
    extra: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Additional flexible metadata"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True,
        description="Pack creation timestamp"
    )

    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last update timestamp"
    )

    # Indexes
    __table_args__ = (
        Index("idx_semantic_pack_status", "status"),
        Index("idx_semantic_pack_author", "author"),
        Index("idx_semantic_pack_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<SemanticPackDB(id='{self.id}', version='{self.version}', label='{self.label}', status='{self.status}')>"

    def to_manifest(self):
        """Convert to SemanticPackManifest schema"""
        from pixsim7.backend.main.shared.schemas.semantic_pack_schemas import (
            SemanticPackManifest,
            SemanticPackStatus,
        )

        return SemanticPackManifest(
            id=self.id,
            version=self.version,
            label=self.label,
            description=self.description,
            author=self.author,
            created_at=self.created_at,
            updated_at=self.updated_at,
            ontology_version_min=self.ontology_version_min,
            ontology_version_max=self.ontology_version_max,
            tags=self.tags,
            parser_hints=self.parser_hints,
            action_block_ids=self.action_block_ids,
            prompt_family_slugs=self.prompt_family_slugs,
            status=SemanticPackStatus(self.status),
            extra=self.extra,
        )
