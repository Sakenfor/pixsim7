"""
Canonical NPC Interaction Model - Python/Pydantic Schemas

Phase 17.2: Server-side schemas matching TypeScript types in @pixsim7/types/interactions

Design Principles:
- Mirror TypeScript types exactly for API compatibility
- Use Pydantic for validation and serialization
- Store in GameWorld.meta (no new DB tables)
- Integrate with existing relationship, mood, and behavior systems
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Literal, Union
from enum import Enum
from pydantic import BaseModel, Field, validator, model_validator


# ===================
# Core Enums
# ===================

class InteractionSurface(str, Enum):
    """Where/how the interaction is presented"""
    INLINE = "inline"
    DIALOGUE = "dialogue"
    SCENE = "scene"
    NOTIFICATION = "notification"
    MENU = "menu"


class BranchIntent(str, Enum):
    """Narrative direction control (reused from action blocks)"""
    ESCALATE = "escalate"
    COOL_DOWN = "cool_down"
    SIDE_BRANCH = "side_branch"
    MAINTAIN = "maintain"
    RESOLVE = "resolve"


class DisabledReason(str, Enum):
    """Why an interaction is unavailable"""
    RELATIONSHIP_TOO_LOW = "relationship_too_low"
    RELATIONSHIP_TOO_HIGH = "relationship_too_high"
    MOOD_INCOMPATIBLE = "mood_incompatible"
    NPC_UNAVAILABLE = "npc_unavailable"
    NPC_BUSY = "npc_busy"
    TIME_INCOMPATIBLE = "time_incompatible"
    FLAG_REQUIRED = "flag_required"
    FLAG_FORBIDDEN = "flag_forbidden"
    COOLDOWN_ACTIVE = "cooldown_active"
    LOCATION_INCOMPATIBLE = "location_incompatible"
    CUSTOM = "custom"


# ===================
# Gating Schema
# ===================

class TimeOfDayConstraint(BaseModel):
    """Time of day constraint"""
    periods: Optional[List[Literal["morning", "afternoon", "evening", "night"]]] = None
    hour_ranges: Optional[List[Dict[str, int]]] = Field(None, alias="hourRanges")


class RelationshipGating(BaseModel):
    """Relationship gating constraints"""
    min_tier_id: Optional[str] = Field(None, alias="minTierId")
    max_tier_id: Optional[str] = Field(None, alias="maxTierId")
    min_affinity: Optional[float] = Field(None, ge=0, le=100, alias="minAffinity")
    min_trust: Optional[float] = Field(None, ge=0, le=100, alias="minTrust")
    min_chemistry: Optional[float] = Field(None, ge=0, le=100, alias="minChemistry")
    max_tension: Optional[float] = Field(None, ge=0, le=100, alias="maxTension")
    min_intimacy_level: Optional[str] = Field(None, alias="minIntimacyLevel")


class BehaviorGating(BaseModel):
    """NPC behavior/state gating constraints"""
    allowed_states: Optional[List[str]] = Field(None, alias="allowedStates")
    forbidden_states: Optional[List[str]] = Field(None, alias="forbiddenStates")
    allowed_activities: Optional[List[str]] = Field(None, alias="allowedActivities")
    forbidden_activities: Optional[List[str]] = Field(None, alias="forbiddenActivities")
    min_simulation_tier: Optional[Literal["dormant", "ambient", "active", "detailed"]] = Field(
        None, alias="minSimulationTier"
    )


class MoodGating(BaseModel):
    """Mood/emotion gating constraints"""
    allowed_moods: Optional[List[str]] = Field(None, alias="allowedMoods")
    forbidden_moods: Optional[List[str]] = Field(None, alias="forbiddenMoods")
    max_emotion_intensity: Optional[float] = Field(None, ge=0, le=1, alias="maxEmotionIntensity")


class InteractionGating(BaseModel):
    """Unified gating configuration"""
    relationship: Optional[RelationshipGating] = None
    time_of_day: Optional[TimeOfDayConstraint] = Field(None, alias="timeOfDay")
    behavior: Optional[BehaviorGating] = None
    mood: Optional[MoodGating] = None
    required_flags: Optional[List[str]] = Field(None, alias="requiredFlags")
    forbidden_flags: Optional[List[str]] = Field(None, alias="forbiddenFlags")
    cooldown_seconds: Optional[int] = Field(None, ge=0, alias="cooldownSeconds")
    custom_gating_id: Optional[str] = Field(None, alias="customGatingId")


# ===================
# Outcome Schema
# ===================

class RelationshipDelta(BaseModel):
    """
    Relationship changes as a result of interaction.

    NOTE: This is a compatibility wrapper around StatDelta targeting the "core.relationships" package.
    Prefer using StatDelta directly for new code, as it provides a generic interface for all stat systems.
    RelationshipDelta will be preserved for backward compatibility with existing content and frontend code.
    """
    affinity: Optional[float] = None
    trust: Optional[float] = None
    chemistry: Optional[float] = None
    tension: Optional[float] = None


class StatDelta(BaseModel):
    """
    Generic stat delta for applying changes to any stat package.

    This model provides a unified way to describe changes to stats across all stat packages,
    replacing hardcoded relationship math with abstract stat system routing through StatEngine.

    Examples:
        # Relationship stat delta (for "core.relationships" package)
        StatDelta(
            package_id="core.relationships",
            axes={"affinity": +5.0, "trust": -3.0},
            entity_type="npc",
            npc_id=42
        )

        # Future: Resource stat delta (for "core.resources" package)
        StatDelta(
            package_id="core.resources",
            axes={"energy": -10.0, "stress": +5.0},
            entity_type="session"
        )
    """
    package_id: str = Field(
        description="Stat package ID (e.g., 'core.relationships', 'core.resources')"
    )
    axes: Dict[str, float] = Field(
        description="Map of axis_name -> delta_value (e.g., {'affinity': +5, 'trust': -3})"
    )
    entity_type: Literal["npc", "session", "world"] = Field(
        default="npc",
        description="Entity scope for this stat delta"
    )
    npc_id: Optional[int] = Field(
        default=None,
        description="Required when entity_type == 'npc'. NPC ID to apply stats to."
    )

    @model_validator(mode='after')
    def validate_npc_id_required(self):
        """Ensure npc_id is provided when entity_type is 'npc'."""
        if self.entity_type == "npc" and self.npc_id is None:
            raise ValueError('npc_id is required when entity_type is "npc"')
        return self


class FlagChanges(BaseModel):
    """Flag changes to apply to session"""
    set: Optional[Dict[str, Any]] = None
    delete: Optional[List[str]] = None
    increment: Optional[Dict[str, float]] = None
    arc_stages: Optional[Dict[str, int]] = Field(None, alias="arcStages")
    quest_updates: Optional[Dict[str, Literal["pending", "active", "completed", "failed"]]] = Field(
        None, alias="questUpdates"
    )
    trigger_events: Optional[List[str]] = Field(None, alias="triggerEvents")
    end_events: Optional[List[str]] = Field(None, alias="endEvents")


class InventoryChange(BaseModel):
    """Single inventory change"""
    item_id: str = Field(alias="itemId")
    quantity: Optional[int] = 1


class InventoryChanges(BaseModel):
    """Inventory changes as a result of interaction"""
    add: Optional[List[InventoryChange]] = None
    remove: Optional[List[InventoryChange]] = None


class MemoryCreation(BaseModel):
    """Memory creation configuration"""
    topic: str
    summary: str
    importance: Optional[Literal["trivial", "normal", "important", "critical"]] = "normal"
    memory_type: Optional[Literal["short_term", "long_term", "core"]] = Field("short_term", alias="memoryType")
    tags: Optional[List[str]] = None


class EmotionTrigger(BaseModel):
    """Emotion trigger configuration"""
    emotion: str
    intensity: float = Field(ge=0, le=1)
    duration_seconds: Optional[int] = Field(None, alias="durationSeconds")


class WorldEventRegistration(BaseModel):
    """World event registration configuration"""
    event_type: str = Field(alias="eventType")
    event_name: str = Field(alias="eventName")
    description: str
    relevance_score: Optional[float] = Field(0.5, ge=0, le=1, alias="relevanceScore")


class NpcEffects(BaseModel):
    """NPC memory/emotion effects"""
    create_memory: Optional[MemoryCreation] = Field(None, alias="createMemory")
    trigger_emotion: Optional[EmotionTrigger] = Field(None, alias="triggerEmotion")
    register_world_event: Optional[WorldEventRegistration] = Field(None, alias="registerWorldEvent")


class SceneLaunch(BaseModel):
    """Scene/generation launch configuration"""
    scene_intent_id: Optional[str] = Field(None, alias="sceneIntentId")
    scene_id: Optional[int] = Field(None, alias="sceneId")
    role_bindings: Optional[Dict[str, str]] = Field(None, alias="roleBindings")
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")


class DialogueGeneration(BaseModel):
    """Dialogue generation configuration"""
    program_id: Optional[str] = Field("default_dialogue", alias="programId")
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")


class GenerationLaunch(BaseModel):
    """Generation/action block configuration"""
    action_block_ids: Optional[List[str]] = Field(None, alias="actionBlockIds")
    dialogue_request: Optional[DialogueGeneration] = Field(None, alias="dialogueRequest")
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")


class InteractionOutcome(BaseModel):
    """Unified outcome configuration"""
    relationship_deltas: Optional[RelationshipDelta] = Field(None, alias="relationshipDeltas")
    flag_changes: Optional[FlagChanges] = Field(None, alias="flagChanges")
    inventory_changes: Optional[InventoryChanges] = Field(None, alias="inventoryChanges")
    npc_effects: Optional[NpcEffects] = Field(None, alias="npcEffects")
    scene_launch: Optional[SceneLaunch] = Field(None, alias="sceneLaunch")
    generation_launch: Optional[GenerationLaunch] = Field(None, alias="generationLaunch")
    narrative_program_id: Optional[str] = Field(None, alias="narrativeProgramId")
    success_message: Optional[str] = Field(None, alias="successMessage")
    failure_message: Optional[str] = Field(None, alias="failureMessage")
    custom_outcome_id: Optional[str] = Field(None, alias="customOutcomeId")


# ===================
# Core Interaction Types
# ===================

class NpcInteractionDefinition(BaseModel):
    """Interaction definition - what designers author"""
    id: str
    label: str
    description: Optional[str] = None
    icon: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    target_roles_or_ids: Optional[List[str]] = Field(None, alias="targetRolesOrIds")
    surface: InteractionSurface
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")
    gating: Optional[InteractionGating] = None
    outcome: Optional[InteractionOutcome] = None
    plugin_config: Optional[Dict[str, Any]] = Field(None, alias="pluginConfig")
    underlying_plugin_id: Optional[str] = Field(None, alias="underlyingPluginId")
    priority: Optional[int] = 0
    npc_can_initiate: Optional[bool] = Field(False, alias="npcCanInitiate")
    meta: Optional[Dict[str, Any]] = None


class RelationshipSnapshot(BaseModel):
    """Relationship state snapshot"""
    affinity: Optional[float] = None
    trust: Optional[float] = None
    chemistry: Optional[float] = None
    tension: Optional[float] = None
    tier_id: Optional[str] = Field(None, alias="tierId")
    intimacy_level_id: Optional[str] = Field(None, alias="intimacyLevelId")


class InteractionContext(BaseModel):
    """Context snapshot for gating checks"""
    location_id: Optional[int] = Field(None, alias="locationId")
    current_activity_id: Optional[str] = Field(None, alias="currentActivityId")
    state_tags: Optional[List[str]] = Field(None, alias="stateTags")
    mood_tags: Optional[List[str]] = Field(None, alias="moodTags")
    relationship_snapshot: Optional[RelationshipSnapshot] = Field(None, alias="relationshipSnapshot")
    world_time: Optional[int] = Field(None, alias="worldTime")
    session_flags: Optional[Dict[str, Any]] = Field(None, alias="sessionFlags")
    last_used_at: Optional[Dict[str, int]] = Field(None, alias="lastUsedAt")


class NpcInteractionInstance(BaseModel):
    """Concrete available interaction at runtime"""
    id: str
    definition_id: str = Field(alias="definitionId")
    npc_id: int = Field(alias="npcId")
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    surface: InteractionSurface
    label: str
    icon: Optional[str] = None
    available: bool
    disabled_reason: Optional[DisabledReason] = Field(None, alias="disabledReason")
    disabled_message: Optional[str] = Field(None, alias="disabledMessage")
    context: Optional[InteractionContext] = None
    priority: Optional[int] = 0


# ===================
# Request/Response Types
# ===================

class ListInteractionsRequest(BaseModel):
    """Request to list available interactions"""
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    npc_id: int = Field(alias="npcId")
    location_id: Optional[int] = Field(None, alias="locationId")
    include_unavailable: Optional[bool] = Field(False, alias="includeUnavailable")


class ListInteractionsResponse(BaseModel):
    """Response with available interactions"""
    interactions: List[NpcInteractionInstance]
    npc_id: int = Field(alias="npcId")
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    timestamp: int


class ExecuteInteractionRequest(BaseModel):
    """Request to execute an interaction"""
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    npc_id: int = Field(alias="npcId")
    interaction_id: str = Field(alias="interactionId")
    player_input: Optional[str] = Field(None, alias="playerInput")
    context: Optional[Dict[str, Any]] = None


class InventoryChangeSummary(BaseModel):
    """Summary of inventory changes"""
    added: Optional[List[str]] = None
    removed: Optional[List[str]] = None


class ExecuteInteractionResponse(BaseModel):
    """Response from interaction execution"""
    success: bool
    message: Optional[str] = None
    relationship_deltas: Optional[RelationshipDelta] = Field(None, alias="relationshipDeltas")
    flag_changes: Optional[List[str]] = Field(None, alias="flagChanges")
    inventory_changes: Optional[InventoryChangeSummary] = Field(None, alias="inventoryChanges")
    launched_scene_id: Optional[int] = Field(None, alias="launchedSceneId")
    generation_request_id: Optional[str] = Field(None, alias="generationRequestId")
    updated_session: Optional[Dict[str, Any]] = Field(None, alias="updatedSession")
    timestamp: int


# ===================
# Storage Schema
# ===================

class WorldInteractionsMetadata(BaseModel):
    """World-level interaction definitions (in GameWorld.meta.interactions)"""
    definitions: Dict[str, NpcInteractionDefinition]
    role_defaults: Optional[Dict[str, List[str]]] = Field(None, alias="roleDefaults")
    scene_intent_mappings: Optional[Dict[str, int]] = Field(None, alias="sceneIntentMappings")


class NpcInteractionsMetadata(BaseModel):
    """NPC-level interaction overrides (in GameNPC.meta.interactions)"""
    definition_overrides: Optional[Dict[str, Dict[str, Any]]] = Field(None, alias="definitionOverrides")
    disabled_interactions: Optional[List[str]] = Field(None, alias="disabledInteractions")
    additional_interactions: Optional[List[NpcInteractionDefinition]] = Field(None, alias="additionalInteractions")


class PendingNpcInteraction(BaseModel):
    """Pending NPC-initiated interaction"""
    interaction_id: str = Field(alias="interactionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")


class SessionInteractionState(BaseModel):
    """Session-level interaction state (in GameSession.flags.npcs["npc:<id>"].interactions)"""
    last_used_at: Optional[Dict[str, int]] = Field(None, alias="lastUsedAt")
    interaction_state: Optional[Dict[str, Any]] = Field(None, alias="interactionState")
    pending_from_npc: Optional[List[PendingNpcInteraction]] = Field(None, alias="pendingFromNpc")


# ===================
# NPC-Initiated Interactions
# ===================

class NpcInteractionIntent(BaseModel):
    """NPC-initiated interaction intent"""
    id: str
    npc_id: int = Field(alias="npcId")
    definition_id: str = Field(alias="definitionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")
    priority: Optional[int] = 0
    preferred_surface: Optional[InteractionSurface] = Field(None, alias="preferredSurface")
    context: Optional[Dict[str, Any]] = None
