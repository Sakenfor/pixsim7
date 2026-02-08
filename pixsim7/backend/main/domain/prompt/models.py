"""
Prompt domain models

Core models for prompt versioning and reusable blocks:
- PromptFamily: Groups related prompt versions (concept/scene grouping)
- PromptVersion: Individual immutable prompt snapshot (Git commit analog)
- PromptBlock: Reusable prompt component (extracted or curated)
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON, Text, String
from uuid import UUID, uuid4
import hashlib
from pgvector.sqlalchemy import Vector

from pixsim7.backend.main.domain.enums import enum_column
from pixsim7.backend.main.domain.prompt.enums import (
    BlockSourceType,
    CurationStatus,
    BlockKind,
    ComplexityLevel,
    BlockIntent,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow


class PromptFamily(SQLModel, table=True):
    """
    A family/concept grouping related prompt versions.

    Examples:
        - "Bench Kiss at Dusk" (multiple lighting/framing variants)
        - "Boss Battle Outcomes" (different victory/defeat scenarios)
        - "NPC Anne - Playful Tease" (dialogue variations)
    """
    __tablename__ = "prompt_families"

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
    The prompt_analysis JSON contains parsed candidates for quick access;
    meaningful blocks are also stored in PromptBlock table for querying.
    """
    __tablename__ = "prompt_versions"

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


class PromptBlock(SQLModel, table=True):
    """
    Reusable prompt component.

    Supports both simple blocks (from curated libraries) and complex blocks
    (extracted from user prompts). Blocks can be composed to build prompts.

    Lifecycle: raw → reviewed → curated
    """
    __tablename__ = "prompt_blocks"

    # Primary Identity
    id: UUID = Field(
        default_factory=uuid4,
        primary_key=True,
        description="Database primary key"
    )
    block_id: str = Field(
        unique=True,
        index=True,
        max_length=200,
        description="Unique block identifier (e.g., 'bench_sit_closer')"
    )

    # Classification
    role: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Role ID for this block (dynamic, e.g., character/action/setting/camera)"
    )
    category: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Fine-grained label: entrance, hand_motion, camera_pov, etc."
    )
    kind: str = Field(
        max_length=50,
        index=True,
        default="single_state",
        description="Block type: 'single_state' or 'transition'"
    )

    # Intent hints
    default_intent: Optional[BlockIntent] = Field(
        default=None,
        sa_column=enum_column(BlockIntent, "prompt_block_intent_enum"),
        description="Default intent for this block (generate/preserve/modify/add/remove)"
    )
    intent_by_operation: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Per-operation intent overrides (operation -> intent string)"
    )

    # Core Content
    text: str = Field(
        sa_column=Column(Text, name="prompt"),
        description="The actual prompt text for this block"
    )
    negative_prompt: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="What to avoid in generation"
    )
    style: Optional[str] = Field(
        default="soft_cinema",
        max_length=100,
        description="Visual style hint"
    )
    duration_sec: float = Field(
        default=6.0,
        description="Target duration in seconds"
    )

    # Structured Tags
    tags: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Structured tags: {location, pose, intimacy_level, mood, intensity, etc}"
    )

    # Compatibility graph
    compatible_next: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Block IDs that can follow this one"
    )
    compatible_prev: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Block IDs that can precede this one"
    )

    # Reference Images (for single_state blocks)
    reference_image: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Reference image configuration"
    )

    # Transition fields
    transition_from: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Start point for transition blocks"
    )
    transition_to: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="End point for transition blocks"
    )
    transition_via: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Intermediate points for transition blocks"
    )

    # Pose tracking
    start_pose: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Starting pose identifier"
    )
    end_pose: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Ending pose identifier"
    )

    # Complexity metrics
    complexity_level: str = Field(
        default="simple",
        max_length=50,
        index=True,
        description="simple, moderate, complex, very_complex"
    )
    char_count: int = Field(
        default=0,
        description="Character count of prompt text"
    )
    word_count: int = Field(
        default=0,
        description="Word count of prompt text"
    )

    # Provenance
    source_type: str = Field(
        default="library",
        max_length=50,
        index=True,
        description="library, parsed, ai_extracted, user_created, migrated, imported"
    )
    source_version_id: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_versions.id",
        index=True,
        description="If extracted from a prompt version, link to source"
    )
    analyzer_id: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Who extracted: 'parser:simple', 'llm:claude-3', NULL for manual"
    )
    curation_status: str = Field(
        default="curated",
        max_length=20,
        index=True,
        description="Block lifecycle: raw | reviewed | curated"
    )

    # Composition Support
    is_composite: bool = Field(
        default=False,
        description="Is this block composed of smaller blocks?"
    )
    component_blocks: List[UUID] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="If composite, UUIDs of component blocks"
    )
    composition_strategy: Optional[str] = Field(
        default=None,
        max_length=50,
        description="How components are combined: sequential, layered, merged"
    )

    # Package/Library Organization
    package_name: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Package/library: bench_park, bar_lounge, enhanced_intimate, custom"
    )

    # Enhanced Features
    camera_movement: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Camera movement configuration"
    )
    consistency: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Consistency flags for generation"
    )
    intensity_progression: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Intensity progression over time"
    )

    # Usage Analytics
    usage_count: int = Field(
        default=0,
        description="Number of times this block was used"
    )
    success_count: int = Field(
        default=0,
        description="Number of successful generations"
    )
    avg_rating: Optional[float] = Field(
        default=None,
        description="Average user rating (1-5)"
    )

    # Access Control
    is_public: bool = Field(
        default=True,
        index=True,
        description="Is this block publicly available?"
    )
    created_by: Optional[str] = Field(
        default=None,
        max_length=100,
        description="User/system that created this block"
    )

    # Metadata
    description: Optional[str] = Field(
        default=None,
        sa_column=Column(Text),
        description="Human-readable description"
    )
    block_metadata: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="block_metadata"),
        description="Additional flexible metadata"
    )

    # Embedding (for semantic similarity search)
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(768)),
        description="Vector embedding for semantic similarity search"
    )
    embedding_model: Optional[str] = Field(
        default=None,
        sa_column=Column(String(100)),
        description="Model that generated the embedding (for invalidation on model switch)"
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
        Index("idx_prompt_block_kind_complexity", "kind", "complexity_level"),
        Index("idx_prompt_block_package_public", "package_name", "is_public"),
        Index("idx_prompt_block_source_type", "source_type"),
        Index("idx_prompt_block_created", "created_at"),
        Index("idx_prompt_block_role_category_status", "role", "category", "curation_status"),
        Index("idx_prompt_block_source_version", "source_type", "source_version_id"),
    )

    def __repr__(self) -> str:
        return f"<PromptBlock(id={self.id}, block_id='{self.block_id}', role={self.role})>"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-compatible dict (for export/API)."""
        result = {
            "id": self.block_id,
            "kind": self.kind,
            "prompt": self.text,
            "style": self.style,
            "durationSec": self.duration_sec,
            "tags": self.tags,
            "compatibleNext": self.compatible_next,
            "compatiblePrev": self.compatible_prev,
        }

        if self.negative_prompt:
            result["negativePrompt"] = self.negative_prompt
        if self.description:
            result["description"] = self.description
        if self.role:
            result["role"] = self.role
        if self.category:
            result["category"] = self.category
        if self.default_intent:
            result["defaultIntent"] = self.default_intent.value
        if self.intent_by_operation:
            result["intentByOperation"] = self.intent_by_operation

        # Type-specific fields
        if self.kind == "single_state":
            if self.reference_image:
                result["referenceImage"] = self.reference_image
            if self.start_pose:
                result["startPose"] = self.start_pose
            if self.end_pose:
                result["endPose"] = self.end_pose
        elif self.kind == "transition":
            if self.transition_from:
                result["from"] = self.transition_from
            if self.transition_to:
                result["to"] = self.transition_to
            if self.transition_via:
                result["via"] = self.transition_via

        # Enhanced features
        if self.camera_movement:
            result["cameraMovement"] = self.camera_movement
        if self.consistency:
            result["consistency"] = self.consistency
        if self.intensity_progression:
            result["intensityProgression"] = self.intensity_progression

        return result
