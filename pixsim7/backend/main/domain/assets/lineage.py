"""
Asset lineage model.

Tracks parent→child relationships between assets (extends, transitions, etc.).
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON, Enum as SAEnum

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.shared.datetime_utils import utcnow


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
        sa_column=Column(
            SAEnum(
                OperationType,
                name="operationtype",
                native_enum=True,
                create_constraint=False,
                values_callable=lambda x: [e.value for e in x],
            )
        ),
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

    # ===== INFLUENCE TRACKING =====
    # How this parent influenced the output (for multi-image edits)
    influence_type: Optional[str] = Field(
        default=None,
        max_length=32,
        description="How parent contributed: 'content', 'style', 'structure', 'mask', 'blend', 'replacement', 'reference'"
    )
    influence_weight: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Estimated contribution weight 0.0-1.0"
    )
    influence_region: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Affected region: 'full', 'foreground', 'background', 'subject:<id>', 'mask:<label>'"
    )

    # ===== PROMPT REFERENCE BINDING =====
    # Links back to how this input was referenced in the prompt
    prompt_ref_name: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Prompt reference token: 'image_1', 'woman_ref', 'animal_source'"
    )

    # ===== EDIT SUMMARIES =====
    # Structured edit records linking to domain entities (avoids prompt parsing)
    # Uses EditSummary schema from image_edit_schemas.py
    edit_summaries: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Structured edit summaries with domain refs: [{action, target_ref, attribute, ...}]"
    )

    created_at: datetime = Field(default_factory=utcnow)

    __table_args__ = (
        # Fast lookups
        Index("idx_lineage_child", "child_asset_id"),
        Index("idx_lineage_parent", "parent_asset_id"),
        Index("idx_lineage_operation", "operation_type"),
        # Find all lineage for a child
        Index("idx_lineage_child_full", "child_asset_id", "sequence_order"),
        # Influence queries (find all inputs by influence type)
        Index("idx_lineage_influence", "child_asset_id", "influence_type"),
    )
