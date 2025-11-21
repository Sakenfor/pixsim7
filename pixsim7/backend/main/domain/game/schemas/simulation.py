from __future__ import annotations

"""
Simulation Configuration Schemas

Game state, world scheduler, turn configuration, and profile schemas.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

class GameStateSchema(BaseModel):
    """
    Game state schema for session-level game mode tracking.
    Stored in GameSession.flags["gameState"]

    Provides a coarse representation of the current game mode:
    - map: Browsing world/region map overview
    - room: In a specific location/room
    - scene: Running a scene graph / cutscene
    - conversation: In a narrative program / chat/dialogue view
    - menu: Global menu / settings
    """

    mode: str = Field(description="Game mode: map, room, scene, conversation, menu")
    world_id: int = Field(description="Current world ID")
    session_id: int = Field(description="Current session ID")
    location_id: Optional[str] = Field(None, description="Current location ID (e.g., 'location:123')")
    scene_id: Optional[int] = Field(None, description="Active scene ID when in scene mode")
    npc_id: Optional[int] = Field(None, description="Focused NPC ID (in conversation/room)")
    narrative_program_id: Optional[str] = Field(None, description="Active narrative program ID, if any")

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        """Ensure mode is one of the allowed values."""
        allowed_modes = {'map', 'room', 'scene', 'conversation', 'menu'}
        if v not in allowed_modes:
            raise ValueError(f'mode must be one of {allowed_modes}')
        return v

    class Config:
        extra = "allow"  # Allow additional fields for future extensibility


# ===================
# World Simulation Scheduler Schemas (Task 21)
# ===================

class WorldSchedulerTierConfigSchema(BaseModel):
    """
    Per-tier NPC limits for world simulation scheduler.
    Defines how many NPCs can be in each tier simultaneously.
    """

    maxNpcs: int = Field(ge=0, description="Maximum NPCs allowed in this tier")
    description: Optional[str] = Field(None, description="Tier description")

    class Config:
        extra = "allow"


class WorldSchedulerConfigSchema(BaseModel):
    """
    World simulation scheduler configuration.
    Stored in GameWorld.meta.simulation

    Controls world time advancement, NPC simulation scheduling,
    and generation job backpressure.

    Example:
    {
        "timeScale": 60,
        "maxNpcTicksPerStep": 50,
        "maxJobOpsPerStep": 10,
        "tickIntervalSeconds": 1.0,
        "tiers": {
            "detailed": {"maxNpcs": 20},
            "active": {"maxNpcs": 100},
            "ambient": {"maxNpcs": 500},
            "dormant": {"maxNpcs": 5000}
        }
    }
    """

    timeScale: float = Field(
        default=1.0,
        ge=0.1,
        le=1000.0,
        description="Game time multiplier (1 real second = timeScale game seconds)"
    )
    maxNpcTicksPerStep: int = Field(
        default=50,
        ge=1,
        description="Maximum NPC simulation ticks per scheduler step"
    )
    maxJobOpsPerStep: int = Field(
        default=10,
        ge=0,
        description="Maximum generation job operations per scheduler step"
    )
    tickIntervalSeconds: float = Field(
        default=1.0,
        ge=0.1,
        le=60.0,
        description="Real-time interval between scheduler ticks (seconds)"
    )
    tiers: Dict[str, WorldSchedulerTierConfigSchema] = Field(
        default_factory=lambda: {
            "detailed": WorldSchedulerTierConfigSchema(maxNpcs=20),
            "active": WorldSchedulerTierConfigSchema(maxNpcs=100),
            "ambient": WorldSchedulerTierConfigSchema(maxNpcs=500),
            "dormant": WorldSchedulerTierConfigSchema(maxNpcs=5000),
        },
        description="Per-tier NPC limits"
    )
    pauseSimulation: bool = Field(
        default=False,
        description="If true, scheduler will not advance world_time or process ticks"
    )
    meta: Optional[Dict] = Field(None, description="Additional scheduler metadata")

    @model_validator(mode='after')
    def validate_tiers_defined(self):
        """Ensure standard tiers are defined."""
        standard_tiers = {"detailed", "active", "ambient", "dormant"}
        defined_tiers = set(self.tiers.keys())
        missing = standard_tiers - defined_tiers
        if missing:
            raise ValueError(
                f'WorldSchedulerConfig must define standard tiers: {missing}'
            )
        return self

    class Config:
        extra = "allow"


def get_default_world_scheduler_config() -> Dict:
    """
    Get default world simulation scheduler configuration.

    Returns a dict that can be stored in GameWorld.meta.simulation
    """
    return {
        "timeScale": 60.0,  # 1 real second = 60 game seconds (1 minute)
        "maxNpcTicksPerStep": 50,
        "maxJobOpsPerStep": 10,
        "tickIntervalSeconds": 1.0,
        "tiers": {
            "detailed": {"maxNpcs": 20, "description": "NPCs near player or critical to scene"},
            "active": {"maxNpcs": 100, "description": "NPCs relevant to current session/arcs"},
            "ambient": {"maxNpcs": 500, "description": "NPCs in same world but not focused"},
            "dormant": {"maxNpcs": 5000, "description": "NPCs not actively simulated"},
        },
        "pauseSimulation": False,
        "meta": {}
    }


# ===================
# GameProfile Schemas (Task 23)
# ===================

class TurnConfigSchema(BaseModel):
    """
    Turn-based configuration for turn-based simulation mode.
    Defines turn length and limits for turn-based gameplay.
    """

    turnDeltaSeconds: int = Field(
        ge=1,
        description="Default turn length in game seconds (e.g., 3600 = 1 hour)"
    )
    maxTurnsPerSession: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum turns allowed per session (optional limit)"
    )

    class Config:
        extra = "allow"


class GameProfileSchema(BaseModel):
    """
    Game profile configuration for a world.
    Stored in GameWorld.meta.gameProfile

    Defines the high-level style and simulation mode for a world,
    allowing the same engine to support both life-sim and visual novel
    game styles through configuration.

    Example:
    {
        "style": "life_sim",
        "simulationMode": "turn_based",
        "turnConfig": {"turnDeltaSeconds": 3600},
        "behaviorProfile": "work_focused",
        "narrativeProfile": "light"
    }
    """

    style: str = Field(
        description=(
            "Game style - determines overall gameplay emphasis. "
            "Options: 'life_sim', 'visual_novel', 'hybrid'"
        )
    )
    simulationMode: str = Field(
        description=(
            "Simulation mode - determines how time progresses. "
            "Options: 'real_time', 'turn_based', 'paused'"
        )
    )
    turnConfig: Optional[TurnConfigSchema] = Field(
        None,
        description="Turn configuration (required for turn_based mode)"
    )
    behaviorProfile: Optional[str] = Field(
        None,
        description=(
            "Behavior profile - influences default behavior scoring. "
            "Options: 'work_focused', 'relationship_focused', 'balanced'"
        )
    )
    narrativeProfile: Optional[str] = Field(
        None,
        description=(
            "Narrative profile - determines narrative emphasis. "
            "Options: 'light', 'moderate', 'heavy'"
        )
    )

    @field_validator('style')
    @classmethod
    def validate_style(cls, v: str) -> str:
        """Ensure style is one of the allowed values."""
        allowed_styles = {'life_sim', 'visual_novel', 'hybrid'}
        if v not in allowed_styles:
            raise ValueError(f'style must be one of {allowed_styles}')
        return v

    @field_validator('simulationMode')
    @classmethod
    def validate_simulation_mode(cls, v: str) -> str:
        """Ensure simulationMode is one of the allowed values."""
        allowed_modes = {'real_time', 'turn_based', 'paused'}
        if v not in allowed_modes:
            raise ValueError(f'simulationMode must be one of {allowed_modes}')
        return v

    @field_validator('behaviorProfile')
    @classmethod
    def validate_behavior_profile(cls, v: Optional[str]) -> Optional[str]:
        """Ensure behaviorProfile is one of the allowed values."""
        if v is not None:
            allowed_profiles = {'work_focused', 'relationship_focused', 'balanced'}
            if v not in allowed_profiles:
                raise ValueError(f'behaviorProfile must be one of {allowed_profiles}')
        return v

    @field_validator('narrativeProfile')
    @classmethod
    def validate_narrative_profile(cls, v: Optional[str]) -> Optional[str]:
        """Ensure narrativeProfile is one of the allowed values."""
        if v is not None:
            allowed_profiles = {'light', 'moderate', 'heavy'}
            if v not in allowed_profiles:
                raise ValueError(f'narrativeProfile must be one of {allowed_profiles}')
        return v

    @model_validator(mode='after')
    def validate_turn_config_required_for_turn_based(self):
        """Ensure turnConfig is provided for turn_based mode."""
        if self.simulationMode == 'turn_based' and self.turnConfig is None:
            raise ValueError('turnConfig is required when simulationMode is "turn_based"')
        return self

    class Config:
        extra = "allow"


def get_default_game_profile() -> Dict:
    """
    Get default game profile configuration.

    Returns a dict that can be stored in GameWorld.meta.gameProfile
    Defaults to hybrid style with real-time simulation.
    """
    return {
        "style": "hybrid",
        "simulationMode": "real_time",
        "behaviorProfile": "balanced",
        "narrativeProfile": "moderate"
    }

