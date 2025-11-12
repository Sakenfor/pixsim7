from __future__ import annotations
from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON

# Scene graph
class GameScene(SQLModel, table=True):
    __tablename__ = "game_scenes"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(max_length=128)
    description: Optional[str] = None
    entry_node_id: Optional[int] = Field(default=None, foreign_key="game_scene_nodes.id")
    meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

class GameSceneNode(SQLModel, table=True):
    __tablename__ = "game_scene_nodes"
    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="game_scenes.id", index=True)
    asset_id: int = Field(index=True, description="References content service assets.id")
    label: Optional[str] = Field(default=None, max_length=128)
    loopable: bool = Field(default=False)
    skippable: bool = Field(default=False)
    reveal_choices_at_sec: Optional[float] = None
    meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    __table_args__ = (Index("idx_scene_node_scene", "scene_id"),)

class GameSceneEdge(SQLModel, table=True):
    __tablename__ = "game_scene_edges"
    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="game_scenes.id", index=True)
    from_node_id: int = Field(foreign_key="game_scene_nodes.id", index=True)
    to_node_id: int = Field(foreign_key="game_scene_nodes.id", index=True)
    choice_label: str = Field(max_length=128)
    weight: float = Field(default=1.0)
    reveal_at_sec: Optional[float] = None
    cooldown_sec: Optional[int] = None
    conditions: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    effects: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    __table_args__ = (
        Index("idx_scene_edge_from", "scene_id", "from_node_id"),
    )

# Sessions
class GameSession(SQLModel, table=True):
    __tablename__ = "game_sessions"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    scene_id: int = Field(foreign_key="game_scenes.id", index=True)
    current_node_id: int = Field(foreign_key="game_scene_nodes.id", index=True)
    flags: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    relationships: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    world_time: float = Field(default=0.0, description="Game time seconds (can map to day cycles)")
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

class GameSessionEvent(SQLModel, table=True):
    __tablename__ = "game_session_events"
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="game_sessions.id", index=True)
    node_id: Optional[int] = Field(default=None, foreign_key="game_scene_nodes.id")
    edge_id: Optional[int] = Field(default=None, foreign_key="game_scene_edges.id")
    action: str = Field(max_length=64)
    diff: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    ts: datetime = Field(default_factory=datetime.utcnow, index=True)

# World basics
class GameLocation(SQLModel, table=True):
    __tablename__ = "game_locations"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=64)
    x: float = Field(default=0.0)
    y: float = Field(default=0.0)
    meta: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

class GameNPC(SQLModel, table=True):
    __tablename__ = "game_npcs"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=64)
    personality: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    home_location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")

class NPCSchedule(SQLModel, table=True):
    __tablename__ = "npc_schedules"
    id: Optional[int] = Field(default=None, primary_key=True)
    npc_id: int = Field(foreign_key="game_npcs.id", index=True)
    day_of_week: int = Field(description="0=Mon")
    start_time: float = Field(description="Seconds into day")
    end_time: float = Field(description="Seconds into day")
    location_id: int = Field(foreign_key="game_locations.id")
    rule: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))

class NPCState(SQLModel, table=True):
    __tablename__ = "npc_state"
    npc_id: Optional[int] = Field(primary_key=True)
    current_location_id: Optional[int] = Field(default=None, foreign_key="game_locations.id")
    state: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    version: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
