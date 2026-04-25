"""
Prompt domain models

Core models for prompt versioning and templates:
- PromptFamily: Groups related prompt versions (concept/scene grouping)
- PromptVersion: Individual immutable prompt snapshot (Git commit analog)
- BlockTemplate: Reusable template for composing prompts from block selections
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON, Text, UniqueConstraint
from uuid import UUID, uuid4
import hashlib

from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.services.audit.model_hooks import AuditMeta


class PromptFamily(SQLModel, table=True):
    """
    A family/concept grouping related prompt versions.

    Examples:
        - "Bench Kiss at Dusk" (multiple lighting/framing variants)
        - "Boss Battle Outcomes" (different victory/defeat scenarios)
        - "NPC Anne - Playful Tease" (dialogue variations)
    """
    __tablename__ = "prompt_families"
    __audit__ = AuditMeta(
        domain="prompt", entity_type="prompt_family", label_field="title",
        tracked_fields=("title", "description", "category", "is_active"),
    )

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique family identifier"
    )

    # Identity
    slug: str = Field(
        max_length=100,
        unique=True,
        index=True,
        description="URL-safe identifier: 'bench-kiss-dusk'"
    )
    title: str = Field(
        max_length=255,
        description="Human-readable title: 'Bench Kiss at Dusk'"
    )
    description: Optional[str] = Field(
        default=None,
        description="Detailed description of this prompt family"
    )

    # Classification
    prompt_type: str = Field(
        max_length=50,
        index=True,
        description="Type: 'visual', 'narrative', 'hybrid'"
    )
    category: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Content category label: 'romance', 'action', 'dialogue', etc."
    )
    authoring_mode_id: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Authoring mode used to create this family (soft ref to authoring_modes.id): "
                    "'character_design', 'scene_setup', etc. Used for tag vocabulary selection."
    )
    primary_character_id: Optional[UUID] = Field(
        default=None,
        index=True,
        description="Primary Character this family is about (soft ref to characters.id). "
                    "Used for deterministic tag derivation: species, archetype, category."
    )
    # Optional game integration
    game_world_id: Optional[UUID] = Field(
        default=None,
        index=True,
        description="Optional: link to specific game world"
    )
    npc_id: Optional[UUID] = Field(
        default=None,
        index=True,
        description="Optional: link to specific NPC"
    )
    scene_id: Optional[UUID] = Field(
        default=None,
        index=True,
        description="Optional: link to specific scene"
    )

    # Metadata
    created_at: datetime = Field(
        default_factory=utcnow,
        index=True
    )
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User/system that created this family"
    )
    is_active: bool = Field(
        default=True,
        index=True,
        description="Inactive families hidden from normal queries"
    )
    family_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="family_metadata"),
        description="Additional flexible metadata"
    )

    __table_args__ = (
        Index("idx_prompt_family_type_category", "prompt_type", "category"),
        Index("idx_prompt_family_active_created", "is_active", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<PromptFamily(id={self.id}, slug='{self.slug}', type={self.prompt_type})>"


class PromptVersion(SQLModel, table=True):
    """
    Individual version of a prompt (Git commit analog).

    Immutable once created - changes require new version.
    The prompt_analysis JSON contains parsed candidates for quick access.
    """
    __tablename__ = "prompt_versions"
    __audit__ = AuditMeta(domain="prompt", entity_type="prompt_version")

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique version identifier"
    )

    # Family relationship (nullable for one-off prompts)
    family_id: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_families.id",
        index=True,
        description="Parent family (NULL for one-off prompts not in library)"
    )

    # Deduplication hash
    prompt_hash: str = Field(
        max_length=64,
        index=True,
        description="SHA256 of normalized prompt_text for dedup"
    )

    # Structured analysis (embedded blocks + tags)
    prompt_analysis: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Analyzed prompt: {blocks: [{role, text}], tags: [...]}"
    )

    # Version tracking (Git-like, nullable for one-off prompts)
    version_number: Optional[int] = Field(
        default=None,
        description="Auto-incrementing version within family (NULL for one-off prompts)"
    )
    parent_version_id: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_versions.id",
        index=True,
        description="Parent version (for branching/forking)"
    )

    # Core prompt content
    prompt_text: str = Field(
        description="The actual prompt text (may contain {{variables}})"
    )
    variables: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Template variables and their types/defaults"
    )
    provider_hints: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Provider-specific optimization hints"
    )

    # Version metadata (Git commit-like)
    commit_message: Optional[str] = Field(
        default=None,
        max_length=500,
        description="What changed: 'Tighter framing, more dramatic lighting'"
    )
    author: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Who created this version"
    )
    created_at: datetime = Field(
        default_factory=utcnow,
        index=True
    )

    # Simple performance metrics (updated periodically)
    generation_count: int = Field(
        default=0,
        description="Number of times this version was used for generation"
    )
    successful_assets: int = Field(
        default=0,
        description="Number of successful asset generations"
    )

    # Optional versioning metadata
    semantic_version: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Optional semantic version: '1.2.3'"
    )
    branch_name: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Optional branch name: 'experimental-lighting'"
    )
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Tags: ['tested', 'production', 'favorite']"
    )

    # Optional diff cache (for UI performance)
    diff_from_parent: Optional[str] = Field(
        default=None,
        description="Cached text diff from parent version"
    )

    # Strategy-aware fields
    compatible_strategies: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Generation strategies this prompt supports: ['once', 'per_playthrough', 'always']"
    )
    allow_randomization: bool = Field(
        default=False,
        description="Whether this prompt supports randomized variations"
    )
    randomization_params: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Randomization configuration: variable pools, weights, selection rules"
    )
    provider_compatibility: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Provider-specific validation results and constraints"
    )

    __table_args__ = (
        Index("idx_prompt_version_family_number", "family_id", "version_number", unique=True),
        Index("idx_prompt_version_created", "created_at"),
        Index("idx_prompt_version_parent", "parent_version_id"),
        UniqueConstraint(
            "prompt_hash", "family_id",
            name="uq_prompt_versions_hash_family",
            postgresql_nulls_not_distinct=True,
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<PromptVersion(id={self.id}, "
            f"family_id={self.family_id}, "
            f"v{self.version_number})>"
        )

    @staticmethod
    def compute_hash(text: str) -> str:
        """Compute SHA256 hash of normalized prompt text."""
        return hashlib.sha256(text.strip().encode('utf-8')).hexdigest()


class BlockTemplate(SQLModel, table=True):
    """
    Reusable template for composing prompts from random block selections.

    A template defines ordered slots, each with constraints (role, category, tags, etc.).
    "Rolling" a template queries matching BlockPrimitive records per slot, randomly picks
    one for each, and composes the result.

    Slots are stored as embedded JSON — they are always loaded/saved with their template
    and never queried independently.
    """
    __tablename__ = "block_templates"

    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique template identifier"
    )

    # Identity
    name: str = Field(
        max_length=255,
        description="Human-readable template name"
    )
    slug: str = Field(
        max_length=100,
        unique=True,
        index=True,
        description="URL-safe identifier: 'romantic-park-scene'"
    )
    description: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="Detailed description of what this template produces"
    )

    # Slot definitions (embedded JSON array)
    slots: List[Dict[str, Any]] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description=(
            "Ordered slot definitions. Each slot: "
            "{slot_index, label, role, category, kind, complexity_min, complexity_max, "
            "package_name, tag_constraints, min_rating, selection_strategy, weight, "
            "optional, fallback_text, exclude_block_ids}"
        )
    )

    # Composition
    composition_strategy: str = Field(
        default="sequential",
        max_length=50,
        description="How selected blocks are combined: sequential, layered, merged"
    )

    # Organization
    package_name: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Package/library grouping"
    )
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Template tags for search/filtering"
    )

    # Access
    is_public: bool = Field(
        default=True,
        index=True,
        description="Is this template publicly available?"
    )
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User/system that created this template"
    )
    owner_user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="Owning user ID (canonical ownership field)",
    )

    # Usage tracking
    roll_count: int = Field(
        default=0,
        description="Number of times this template has been rolled"
    )

    # Flexible metadata
    template_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="template_metadata"),
        description="Additional flexible metadata"
    )

    # Character bindings (role name -> {character_id: str})
    character_bindings: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="character_bindings"),
        description="Maps role names to Character entities for {{role}} expansion"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=utcnow,
        index=True
    )
    updated_at: datetime = Field(
        default_factory=utcnow
    )

    __table_args__ = (
        Index("idx_block_template_package_public", "package_name", "is_public"),
        Index("idx_block_template_owner_public", "owner_user_id", "is_public"),
        Index("idx_block_template_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<BlockTemplate(id={self.id}, slug='{self.slug}', slots={len(self.slots)})>"
