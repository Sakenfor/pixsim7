"""Prompt versioning domain models - Git-like prompt management

Purpose:
    Provides Git-like versioning for prompts used in visual and narrative generation.
    Enables tracking, iteration, and performance analysis of prompt variants.

Core Models:
    - PromptFamily: Groups related prompt versions (e.g., "bench kiss variants")
    - PromptVersion: Individual version of a prompt (like a Git commit)

Design Philosophy:
    - Families group concepts/scenes
    - Versions are immutable snapshots
    - Loose coupling with jobs/artifacts via optional linkage
    - Analytics tracked separately for performance
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
from uuid import UUID, uuid4


class PromptFamily(SQLModel, table=True):
    """
    A family/concept grouping related prompt versions

    Examples:
        - "Bench Kiss at Dusk" (multiple lighting/framing variants)
        - "Boss Battle Outcomes" (different victory/defeat scenarios)
        - "NPC Anne - Playful Tease" (dialogue variations)
    """
    __tablename__ = "prompt_families"

    # Primary key - using UUID for better cross-system compatibility
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
        description="Category: 'romance', 'action', 'dialogue', etc."
    )
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Tags: ['intimacy:high', 'location:park', 'mood:romantic']"
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
    action_concept_id: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Optional: link to action block concept"
    )

    # Metadata
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
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
        sa_column=Column(JSON),
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
    Individual version of a prompt (Git commit analog)

    Immutable once created - changes require new version.
    """
    __tablename__ = "prompt_versions"

    # Primary key
    id: Optional[UUID] = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Unique version identifier"
    )

    # Family relationship
    family_id: UUID = Field(
        foreign_key="prompt_families.id",
        index=True,
        description="Parent family this version belongs to"
    )

    # Version tracking (Git-like)
    version_number: int = Field(
        description="Auto-incrementing version within family (1, 2, 3...)"
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
        default_factory=datetime.utcnow,
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

    # Strategy-aware fields (added 2025-11-18)
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
    )

    def __repr__(self) -> str:
        return (
            f"<PromptVersion(id={self.id}, "
            f"family_id={self.family_id}, "
            f"v{self.version_number})>"
        )


class PromptVariantFeedback(SQLModel, table=True):
    """
    Feedback on a specific combination of prompt version + input assets + output asset.

    This is where we track:
        - Which seed images were used
        - Which output asset was produced
        - Per-variant ratings, favorites, and notes
    """
    __tablename__ = "prompt_variant_feedback"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Identity and linkage
    prompt_version_id: UUID = Field(
        foreign_key="prompt_versions.id",
        index=True,
        description="Prompt version used for this generation"
    )
    output_asset_id: int = Field(
        foreign_key="assets.id",
        index=True,
        description="Asset produced by this combination"
    )
    input_asset_ids: List[int] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Asset IDs used as seeds / keyframes for this generation"
    )
    generation_id: Optional[int] = Field(
        default=None,
        foreign_key="generations.id",
        index=True,
        description="Optional link back to the unified generation record"
    )

    # Who rated it
    user_id: Optional[int] = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        description="User who provided feedback"
    )

    # Ratings and quality
    user_rating: Optional[int] = Field(
        default=None,
        description="Explicit 1-5 rating from user"
    )
    quality_score: Optional[float] = Field(
        default=None,
        description="Optional computed quality score (e.g., aggregate metric)"
    )
    is_favorite: bool = Field(
        default=False,
        description="Whether user marked this variant as favorite"
    )
    notes: Optional[str] = Field(
        default=None,
        description="Free-form notes about this result"
    )

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )
