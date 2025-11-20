from __future__ import annotations

"""
ECS Component Schemas

Pydantic schemas for Entity-Component-System NPC components.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

class RelationshipCoreComponentSchema(BaseModel):
    """
    Relationship core component schema.
    Contains the fundamental relationship metrics between player and NPC.
    Component key: "core"
    """

    affinity: float = Field(ge=0, le=100, description="How much the NPC likes the player")
    trust: float = Field(ge=0, le=100, description="How much the NPC trusts the player")
    chemistry: float = Field(ge=0, le=100, description="Romantic/physical attraction")
    tension: float = Field(ge=0, le=100, description="Conflict or unresolved issues")
    tierId: Optional[str] = Field(None, description="Computed relationship tier ID")
    intimacyLevelId: Optional[str] = Field(None, description="Computed intimacy level ID")

    class Config:
        extra = "allow"  # Allow additional fields for future extensibility


class RomanceComponentSchema(BaseModel):
    """
    Romance state component schema.
    Manages romance-specific state and progression.
    Component key: "romance"
    Source: Typically owned by plugin:game-romance
    """

    arousal: Optional[float] = Field(None, ge=0, le=1, description="Arousal level")
    consentLevel: Optional[float] = Field(None, ge=0, le=1, description="Consent level")
    stage: Optional[str] = Field(None, description="Romance stage identifier")
    flags: Optional[Dict] = Field(None, description="Romance-specific flags")
    customStats: Optional[Dict[str, float]] = Field(None, description="Custom romance stats")

    class Config:
        extra = "allow"


class StealthComponentSchema(BaseModel):
    """
    Stealth state component schema.
    Manages stealth-related interactions and reputation.
    Component key: "stealth"
    Source: Typically owned by plugin:game-stealth
    """

    suspicion: Optional[float] = Field(None, ge=0, le=1, description="Suspicion level")
    lastCaught: Optional[int] = Field(None, description="Timestamp when player was last caught")
    guardReputation: Optional[float] = Field(None, description="Reputation with guards/authorities")
    flags: Optional[Dict] = Field(None, description="Stealth-specific flags")

    class Config:
        extra = "allow"


class MoodStateComponentSchema(BaseModel):
    """
    Unified mood state component schema.
    Combines general mood, intimacy mood, and active emotions.
    Component key: "mood"
    """

    class GeneralMood(BaseModel):
        moodId: str
        valence: float = Field(ge=0, le=100)
        arousal: float = Field(ge=0, le=100)

    class IntimacyMood(BaseModel):
        moodId: str
        intensity: float = Field(ge=0, le=1)

    class ActiveEmotion(BaseModel):
        emotionType: str
        intensity: float = Field(ge=0, le=1)
        trigger: Optional[str] = None
        expiresAt: Optional[int] = None

    general: Optional[GeneralMood] = None
    intimacy: Optional[IntimacyMood] = None
    activeEmotion: Optional[ActiveEmotion] = None

    class Config:
        extra = "allow"


class QuestParticipationComponentSchema(BaseModel):
    """
    Quest participation component schema.
    Tracks NPC involvement in quests/arcs.
    Component key: "quests"
    """

    activeQuests: Optional[List[str]] = Field(None, description="Active quests this NPC is involved in")
    completedQuests: Optional[List[str]] = Field(None, description="Completed quests")
    questFlags: Optional[Dict] = Field(None, description="Quest-specific progress flags")

    class Config:
        extra = "allow"


class BehaviorStateComponentSchema(BaseModel):
    """
    Behavior state component schema.
    Tracks NPC's current activity and simulation tier.
    Component key: "behavior"
    """

    currentActivity: Optional[str] = Field(None, description="Current activity ID")
    activityStartedAt: Optional[int] = Field(None, description="Activity started timestamp")
    nextDecisionAt: Optional[int] = Field(None, description="Next decision time")
    simulationTier: Optional[str] = Field(None, description="Simulation tier")
    tags: Optional[List[str]] = Field(None, description="Behavior tags")
    locationId: Optional[str] = Field(None, description="Current location")

    class Config:
        extra = "allow"


class InteractionStateComponentSchema(BaseModel):
    """
    Interaction state component schema.
    Tracks interaction cooldowns and chain progress.
    Component key: "interactions"
    """

    class ChainProgress(BaseModel):
        currentStep: int
        startedAt: int
        data: Optional[Dict] = None

    lastUsedAt: Optional[Dict[str, int]] = Field(None, description="Timestamps when interactions were last used")
    chainProgress: Optional[Dict[str, ChainProgress]] = Field(None, description="Interaction chain progress")
    flags: Optional[Dict] = Field(None, description="Interaction-specific flags")

    class Config:
        extra = "allow"


class PluginComponentSchema(BaseModel):
    """
    Plugin component schema.
    Arbitrary plugin-owned component data.
    Component key: "plugin:{pluginId}" or "plugin:{pluginId}:{componentName}"
    """

    class Config:
        extra = "allow"  # Plugins can define any structure


class NpcEntityStateSchema(BaseModel):
    """
    NPC Entity State schema (ECS model).
    Authoritative per-NPC state stored in GameSession.flags.npcs["npc:{id}"]

    This replaces the ad-hoc SessionNpcData structure with a component-based model.
    Components are keyed by standard names:
    - "core" - RelationshipCoreComponentSchema
    - "romance" - RomanceComponentSchema
    - "stealth" - StealthComponentSchema
    - "mood" - MoodStateComponentSchema
    - "quests" - QuestParticipationComponentSchema
    - "behavior" - BehaviorStateComponentSchema
    - "interactions" - InteractionStateComponentSchema
    - "plugin:{id}" - PluginComponentSchema
    """

    components: Dict[str, Dict] = Field(default_factory=dict, description="Component data indexed by component name")
    tags: Optional[List[str]] = Field(None, description="Entity tags for quick filtering")
    metadata: Optional[Dict] = Field(None, description="Additional metadata")

    class Config:
        extra = "allow"
