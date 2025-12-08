"""Action Block domain model - Database-backed reusable prompt components

This replaces JSON file storage with PostgreSQL while maintaining backward compatibility.
Action blocks can be simple (200-300 chars) or complex (1000+ chars).

Supports unified block lifecycle:
- PromptVersion.prompt_analysis = all parsed blocks (cheap JSON storage)
- ActionBlockDB = meaningful blocks only (indexed, queryable)
- curation_status tracks lifecycle: raw → reviewed → curated
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON, Text, Enum as SAEnum
from uuid import UUID, uuid4

from pixsim7.backend.main.services.prompt_parser.simple import ParsedRole


class ActionBlockDB(SQLModel, table=True):
    """Database-backed action blocks for reusable prompt components

    Supports both simple blocks (from JSON libraries) and complex blocks
    (extracted from user prompts). Maintains compatibility with existing
    ActionBlock JSON format.
    """
    __tablename__ = "action_blocks"

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

    # Block Type
    kind: str = Field(
        max_length=50,
        index=True,
        description="Block type: 'single_state' or 'transition'"
    )

    # Core Content
    prompt: str = Field(
        sa_column=Column(Text),
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

    # Structured Tags (KEEP EXISTING FORMAT)
    tags: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Structured tags: {location, pose, intimacy_level, mood, intensity, etc}"
    )

    # Compatibility (KEEP EXISTING FORMAT)
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

    # Reference Images (for single_state and transition blocks)
    reference_image: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Reference image configuration for single_state blocks"
    )

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

    # Pose tracking (for single_state blocks)
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

    # NEW: Complexity Support
    complexity_level: str = Field(
        default="simple",
        max_length=50,
        index=True,
        description="simple (200-300), moderate (300-600), complex (600-1000), very_complex (1000+)"
    )

    char_count: int = Field(
        default=0,
        description="Character count of prompt text"
    )

    word_count: int = Field(
        default=0,
        description="Word count of prompt text"
    )

    # NEW: Source Tracking
    source_type: str = Field(
        default="library",
        max_length=50,
        index=True,
        description="library, ai_extracted, user_created, migrated, imported"
    )

    extracted_from_prompt_version: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_versions.id",
        index=True,
        description="If extracted from a prompt version, link to it"
    )

    # Block Classification (for unified lifecycle)
    role: Optional[ParsedRole] = Field(
        default=None,
        sa_column=Column(SAEnum(ParsedRole, native_enum=False), index=True),
        description="Coarse classification: character, action, setting, mood, romance, other"
    )

    category: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Fine-grained label for UI: entrance, hand_motion, camera_pov, etc."
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

    # NEW: Versioning Link
    prompt_version_id: Optional[UUID] = Field(
        default=None,
        foreign_key="prompt_versions.id",
        index=True,
        description="Link to prompt versioning system"
    )

    # Package/Library Organization
    package_name: Optional[str] = Field(
        default=None,
        max_length=100,
        index=True,
        description="Package/library: bench_park, bar_lounge, enhanced_intimate, custom"
    )

    # Enhanced Features (v2 support)
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

    # Community & Permissions
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
        sa_column=Column(JSON),
        description="Additional flexible metadata"
    )

    # Timestamps
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True
    )

    updated_at: datetime = Field(
        default_factory=datetime.utcnow
    )

    # Indexes
    __table_args__ = (
        Index("idx_action_block_kind_complexity", "kind", "complexity_level"),
        Index("idx_action_block_package_public", "package_name", "is_public"),
        Index("idx_action_block_source_type", "source_type"),
        Index("idx_action_block_created", "created_at"),
        # New indexes for unified lifecycle
        Index("idx_action_block_role_category_status", "role", "category", "curation_status"),
        Index("idx_action_block_source_extracted", "source_type", "extracted_from_prompt_version"),
    )

    def __repr__(self) -> str:
        return f"<ActionBlock(id={self.id}, block_id='{self.block_id}', kind={self.kind}, complexity={self.complexity_level})>"

    def to_json_dict(self) -> Dict[str, Any]:
        """Convert to JSON-compatible dict (for export)

        Returns format compatible with existing JSON libraries
        """
        result = {
            "id": self.block_id,
            "kind": self.kind,
            "prompt": self.prompt,
            "style": self.style,
            "durationSec": self.duration_sec,
            "tags": self.tags,
            "compatibleNext": self.compatible_next,
            "compatiblePrev": self.compatible_prev,
        }

        # Add optional fields if present
        if self.negative_prompt:
            result["negativePrompt"] = self.negative_prompt

        if self.description:
            result["description"] = self.description

        # Add type-specific fields
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

        # Add enhanced features if present
        if self.camera_movement:
            result["cameraMovement"] = self.camera_movement

        if self.consistency:
            result["consistency"] = self.consistency

        if self.intensity_progression:
            result["intensityProgression"] = self.intensity_progression

        return result
