"""
Snapshot and scenario script models for world and session state capture/restore
"""
from __future__ import annotations
from typing import Dict, List, Any, Union, Literal, Optional
from pydantic import BaseModel, Field


class SessionSnapshot(BaseModel):
    """Snapshot of a single game session's state"""
    session_id: int = Field(..., description="Session ID")
    flags: Dict[str, Any] = Field(default_factory=dict, description="Session flags")
    relationships: Dict[str, Any] = Field(default_factory=dict, description="NPC relationships")
    world_time: float = Field(default=0.0, description="Session world time")
    version: int = Field(default=1, description="Session version")

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": 1,
                "flags": {"sessionKind": "world"},
                "relationships": {"npc:1": {"affinity": 50}},
                "world_time": 3600.0,
                "version": 1
            }
        }


class WorldSnapshot(BaseModel):
    """Complete snapshot of world + associated sessions"""
    world_id: int = Field(..., description="World ID")
    world_meta: Dict[str, Any] = Field(default_factory=dict, description="World metadata")
    world_time: float = Field(default=0.0, description="Global world time")
    sessions: List[SessionSnapshot] = Field(default_factory=list, description="Session snapshots")

    class Config:
        json_schema_extra = {
            "example": {
                "world_id": 1,
                "world_meta": {"relationship_schemas": {}},
                "world_time": 3600.0,
                "sessions": [
                    {
                        "session_id": 1,
                        "flags": {},
                        "relationships": {},
                        "world_time": 3600.0,
                        "version": 1
                    }
                ]
            }
        }


# ===== Scenario Script Models =====


class TickStep(BaseModel):
    """Tick step - advance world time"""
    kind: Literal["tick"] = "tick"
    world_id: int = Field(..., description="World ID")
    delta_seconds: float = Field(..., description="Time delta in seconds")


class InteractionStep(BaseModel):
    """Interaction step - execute an interaction with a target"""
    kind: Literal["interaction"] = "interaction"
    world_id: int = Field(..., description="World ID")
    session_id: int = Field(..., description="Session ID")
    target_kind: str = Field(..., description="Target kind (e.g., npc)")
    target_id: int = Field(..., description="Target ID")
    interaction_id: str = Field(..., description="Interaction identifier")
    params: Optional[Dict[str, Any]] = Field(default=None, description="Optional parameters")


class NarrativeStep(BaseModel):
    """Narrative step - advance narrative runtime"""
    kind: Literal["narrativeStep"] = "narrativeStep"
    world_id: int = Field(..., description="World ID")
    session_id: int = Field(..., description="Session ID")
    npc_id: int = Field(..., description="NPC ID")
    input: Optional[Any] = Field(default=None, description="Optional input data")


class AssertStep(BaseModel):
    """Assert step - checkpoint for assertions"""
    kind: Literal["assert"] = "assert"
    assert_id: str = Field(..., description="Assertion identifier")
    description: Optional[str] = Field(default=None, description="Human-readable description")


# Union type for all scenario steps
ScenarioStep = Union[TickStep, InteractionStep, NarrativeStep, AssertStep]


class ScenarioScript(BaseModel):
    """Complete scenario script"""
    id: str = Field(..., description="Script ID")
    name: str = Field(..., description="Script name")
    description: Optional[str] = Field(default=None, description="Script description")
    snapshot: WorldSnapshot = Field(..., description="Initial world snapshot")
    steps: List[ScenarioStep] = Field(default_factory=list, description="Scenario steps")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "test_scenario_001",
                "name": "Basic Tick Test",
                "description": "Tests basic world time advancement",
                "snapshot": {
                    "world_id": 1,
                    "world_meta": {},
                    "world_time": 0.0,
                    "sessions": []
                },
                "steps": [
                    {"kind": "tick", "world_id": 1, "delta_seconds": 3600.0},
                    {"kind": "assert", "assert_id": "check_time_advanced"}
                ]
            }
        }


class ScenarioScriptMetadata(BaseModel):
    """Scenario script metadata (without full snapshot/steps)"""
    id: str = Field(..., description="Script ID")
    name: str = Field(..., description="Script name")
    description: Optional[str] = Field(default=None, description="Script description")
    world_id: int = Field(..., description="World ID")
    step_count: int = Field(..., description="Number of steps")
    assert_count: int = Field(..., description="Number of assertions")
