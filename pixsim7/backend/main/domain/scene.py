"""
Scene domain models - collections of connected assets (Phase 2)

A Scene is a container for multiple assets with connections between them.
This is the foundation for:
- Video sequences (asset1 → asset2 → asset3)
- Branching narratives (asset1 → choice → asset2a OR asset2b)
- Story assembly (organize assets by day/time/character)

Phase 3 will add StoryNode (wraps Scene with narrative metadata like affection changes)
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

from pixsim7.backend.main.shared.datetime_utils import utcnow


class Scene(SQLModel, table=True):
    """
    Scene: collection of connected assets

    Use cases:
    - Simple sequence: Morning routine (wake up → breakfast → leave house)
    - Branching: Date scene (approach girl → accept OR reject)
    - Day organization: Day 1 Morning (multiple short clips)
    """
    __tablename__ = "scenes"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Owner
    user_id: int = Field(foreign_key="users.id", index=True)

    # ===== METADATA =====
    name: str = Field(max_length=255)
    description: Optional[str] = None

    # ===== ORGANIZATION =====
    tags: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Tags for organization/search"
    )

    # ===== STATE =====
    is_template: bool = Field(
        default=False,
        description="Template scene (reusable)"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def __repr__(self):
        return f"<Scene(id={self.id}, name='{self.name}')>"


class SceneAsset(SQLModel, table=True):
    """
    Asset within a scene (with position and ordering)

    Represents one asset in a scene with:
    - Order in sequence
    - Visual position (for editor canvas)
    - Metadata (can store game-specific data later)
    """
    __tablename__ = "scene_assets"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== LINKS =====
    scene_id: int = Field(foreign_key="scenes.id", index=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)

    # ===== SEQUENCING =====
    order: int = Field(
        description="Sequence order (0, 1, 2, ...)"
    )

    # ===== VISUAL LAYOUT (for editor) =====
    position_x: float = Field(
        default=0,
        description="X coordinate on canvas"
    )
    position_y: float = Field(
        default=0,
        description="Y coordinate on canvas"
    )

    # ===== METADATA =====
    # Can store:
    # - Game metadata: {"day": 1, "time": "morning", "character": "emma"}
    # - Playback options: {"autoplay": true, "skip_allowed": false}
    # - Annotations: {"note": "reshoot this scene"}
    meta_data: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON)
    )

    def __repr__(self):
        return (
            f"<SceneAsset("
            f"scene_id={self.scene_id}, "
            f"asset_id={self.asset_id}, "
            f"order={self.order})>"
        )


class SceneConnection(SQLModel, table=True):
    """
    Connection between assets in a scene

    Represents edges in the scene graph:
    - Linear: asset1 --next--> asset2
    - Branching: asset1 --choice--> asset2a OR asset2b
    - Conditional: asset1 --if(condition)--> asset2
    """
    __tablename__ = "scene_connections"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # ===== SCENE =====
    scene_id: int = Field(foreign_key="scenes.id", index=True)

    # ===== CONNECTION =====
    from_scene_asset_id: int = Field(
        foreign_key="scene_assets.id",
        description="Source asset in scene"
    )
    to_scene_asset_id: int = Field(
        foreign_key="scene_assets.id",
        description="Target asset in scene"
    )

    # ===== CONNECTION TYPE =====
    connection_type: str = Field(
        max_length=20,
        default="next",
        description="Type: 'next', 'choice', 'branch', 'conditional'"
    )

    # ===== LABEL =====
    # For choices: "Ask her out"
    # For conditions: "if affection > 10"
    label: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Connection label (e.g., choice text)"
    )

    # ===== METADATA =====
    # Can store:
    # - Choice effects: {"affection": {"emma": +5}}
    # - Prerequisites: {"requires_affection": {"emma": 10}}
    # - Transition effects: {"fade_duration": 1.5}
    meta_data: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON)
    )

    # ===== ORDERING =====
    # For multiple connections from same asset (choices)
    order: int = Field(
        default=0,
        description="Display order for choices"
    )

    def __repr__(self):
        return (
            f"<SceneConnection("
            f"scene_id={self.scene_id}, "
            f"type={self.connection_type}, "
            f"label='{self.label}')>"
        )


# ===== PHASE 3 PREVIEW =====
# Phase 3 will add StoryNode, which wraps Scene with narrative metadata:
#
# class StoryNode(SQLModel, table=True):
#     """Story node: Scene + narrative metadata (Phase 3)"""
#     id: int
#     scene_id: int  # FK to Scene
#     day: int
#     time_slot: str  # "morning", "afternoon", "evening", "night"
#     character_route: str | None  # "emma", "sophie", "common"
#     affection_changes: dict  # {"emma": +5, "sophie": -2}
#     prerequisites: dict  # {"affection": {"emma": 10}}
#     is_ending: bool
#     ending_type: str | None  # "good", "bad", "true"
