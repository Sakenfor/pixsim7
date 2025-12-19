"""
Asset lineage and branching models

Tracks asset derivation and branching for:
- Lineage: parent→child relationships (extends, transitions, etc.)
- Branching: multiple variants from same source point
- Game integration: efficient branch point queries
"""
from typing import Optional, Dict, Any
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON

from pixsim7.backend.main.domain.enums import OperationType, enum_column


class AssetLineage(SQLModel, table=True):
    """
    Tracks parent→child relationships between assets

    Represents edges in the asset derivation graph.
    Supports multiple parents (e.g., transition from 3 images).

    Examples:
    - Video extend: video_A → extend → video_B
    - Transition: [image_1, image_2, image_3] → transition → video_C
    - Sora storyboard: [keyframe_1, keyframe_2] → storyboard → video_D
    """
    __tablename__ = "asset_lineage"
    __table_args__ = {'extend_existing': True}

    id: Optional[int] = Field(default=None, primary_key=True)

    # The relationship
    child_asset_id: int = Field(
        foreign_key="assets.id",
        description="Asset that was created (output)"
    )
    parent_asset_id: int = Field(
        foreign_key="assets.id",
        description="Asset that was used as input"
    )

    # How parent was used (renamed from parent_role for clarity)
    relation_type: str = Field(
        max_length=32,
        description="Semantic role: 'source', 'keyframe', 'reference_image', 'audio_track', 'start_frame', 'end_frame'"
    )

    # What operation created the child
    operation_type: OperationType = Field(
        sa_column=enum_column(OperationType, "asset_lineage_operation_enum"),
        description="VIDEO_EXTEND, VIDEO_TRANSITION, IMAGE_TO_VIDEO, etc."
    )

    # ===== TEMPORAL METADATA =====
    # Where in parent video/image was used (preserved for paused video generation!)
    parent_start_time: Optional[float] = Field(
        default=None,
        description="Start time in parent video (seconds) - e.g., paused at 10.5s"
    )
    parent_end_time: Optional[float] = Field(
        default=None,
        description="End time in parent video (seconds) - for clip ranges"
    )
    parent_frame: Optional[int] = Field(
        default=None,
        description="Specific frame number in parent (e.g., keyframe at frame 48)"
    )

    # Sequence order (for operations with multiple inputs)
    sequence_order: int = Field(
        default=0,
        description="Order of this parent in multi-input operations (0=first)"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        # Fast lookups
        Index("idx_lineage_child", "child_asset_id"),
        Index("idx_lineage_parent", "parent_asset_id"),
        Index("idx_lineage_operation", "operation_type"),
        # Find all lineage for a child
        Index("idx_lineage_child_full", "child_asset_id", "sequence_order"),
    )


class AssetBranch(SQLModel, table=True):
    """
    Represents a branch point where multiple variants diverge

    Use case: Video paused at 10.5s, user creates 3 different extensions
    Game use case: Player choice leads to different outcomes

    Example:
    - source_asset_id: 123 (base video)
    - branch_time: 10.5 (seconds)
    - Variants: ["hero_wins", "hero_escapes", "hero_sacrifices"]
    """
    __tablename__ = "asset_branches"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Source asset that branches
    source_asset_id: int = Field(
        foreign_key="assets.id",
        index=True,
        description="Asset that has multiple branches"
    )

    # Where the branch occurs
    branch_time: float = Field(
        description="Time in video where branch occurs (seconds)"
    )
    branch_frame: Optional[int] = Field(
        default=None,
        description="Exact frame number"
    )

    # Branch metadata
    branch_name: Optional[str] = Field(
        default=None,
        max_length=128,
        description="User-friendly name: 'Hero wins', 'Villain escapes'"
    )
    branch_description: Optional[str] = Field(
        default=None,
        description="Detailed description of this branch"
    )

    # Game integration
    branch_tag: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Tag for game logic: 'ending_A', 'path_epic_battle'"
    )

    # Branch type (for different branching strategies)
    branch_type: str = Field(
        default="manual",
        max_length=32,
        description="'manual', 'automatic', 'conditional', 'random'"
    )

    # Ordering for UI
    display_order: int = Field(
        default=0,
        description="Display order in UI (0=default path)"
    )

    # Game metadata
    game_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Game-specific metadata: conditions, triggers, variables"
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_branch_source_time", "source_asset_id", "branch_time"),
        Index("idx_branch_tag", "branch_tag"),
    )


class AssetBranchVariant(SQLModel, table=True):
    """
    Links a branch point to its variant assets

    Example: Branch #5 has 3 variants (3 different extended videos)
    Each variant represents one possible outcome at the branch point.
    """
    __tablename__ = "asset_branch_variants"

    id: Optional[int] = Field(default=None, primary_key=True)

    branch_id: int = Field(
        foreign_key="asset_branches.id",
        index=True
    )
    variant_asset_id: int = Field(
        foreign_key="assets.id",
        index=True,
        description="One of the variant assets from this branch"
    )

    # Variant metadata
    variant_name: str = Field(
        max_length=128,
        description="'Epic victory', 'Narrow escape', 'Sacrifice ending'"
    )
    variant_description: Optional[str] = None

    # Game metadata
    variant_tag: Optional[str] = Field(
        default=None,
        max_length=64,
        description="'hero_wins', 'villain_escapes'"
    )

    # Probability / Weight (for random selection)
    weight: float = Field(
        default=1.0,
        description="Weight for random selection (higher = more likely)"
    )

    # Conditions (for conditional branching)
    conditions: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Conditions for this variant: player stats, inventory, flags, etc."
    )

    # Display order
    display_order: int = Field(default=0)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_branch_variant_unique", "branch_id", "variant_asset_id", unique=True),
        Index("idx_branch_variant_tag", "variant_tag"),
    )


class AssetClip(SQLModel, table=True):
    """
    Represents a clip/segment of a larger asset

    Use case: Dynamic video cutting for game playback
    Example: Extract seconds 10.5-15.3 from video_123 as reusable clip

    This allows:
    - Pre-defined clips for faster loading
    - Highlight reels
    - Custom edit sequences
    """
    __tablename__ = "asset_clips"

    id: Optional[int] = Field(default=None, primary_key=True)

    # Source asset
    source_asset_id: int = Field(
        foreign_key="assets.id",
        index=True,
        description="Full video that this clip is extracted from"
    )

    # Temporal bounds
    start_time: float = Field(
        description="Start time in source video (seconds)"
    )
    end_time: float = Field(
        description="End time in source video (seconds)"
    )
    start_frame: Optional[int] = None
    end_frame: Optional[int] = None

    # Clip metadata
    clip_name: str = Field(
        max_length=128,
        description="'Boss intro', 'Victory celebration', 'Defeat sequence'"
    )
    clip_tag: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Tag for game logic: 'intro_boss_01', 'outro_victory'"
    )

    # Optional: Rendered clip (if pre-rendered for performance)
    clip_asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        description="Pre-rendered clip asset (optional, for performance)"
    )

    # Playback metadata
    playback_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Loop count, speed multiplier, effects, etc."
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index("idx_clip_source", "source_asset_id", "start_time"),
        Index("idx_clip_tag", "clip_tag"),
    )
