"""
Canonical NPC Interaction Model - Python/Pydantic Schemas

Phase 17.2: Server-side schemas matching TypeScript types in @pixsim7/types/interactions

Design Principles:
- Mirror TypeScript types exactly for API compatibility
- Use Pydantic for validation and serialization
- Store in GameWorld.meta (no new DB tables)
- Integrate with stat packages, mood, and behavior systems
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Literal
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict

# Import canonical BranchIntent from action_blocks (single source of truth)
from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import BranchIntent


# ===================
# Base Model
# ===================

class InteractionBaseModel(BaseModel):
    """Base model for all interaction schemas.

    Configures populate_by_name=True so schemas accept both:
    - camelCase (alias) - for TypeScript/frontend compatibility
    - snake_case (field name) - for Python code compatibility
    """
    model_config = ConfigDict(populate_by_name=True)


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


class DisabledReason(str, Enum):
    """Why an interaction is unavailable"""
    MOOD_INCOMPATIBLE = "mood_incompatible"
    NPC_UNAVAILABLE = "npc_unavailable"
    NPC_BUSY = "npc_busy"
    TIME_INCOMPATIBLE = "time_incompatible"
    FLAG_REQUIRED = "flag_required"
    FLAG_FORBIDDEN = "flag_forbidden"
    COOLDOWN_ACTIVE = "cooldown_active"
    LOCATION_INCOMPATIBLE = "location_incompatible"
    STAT_GATING_FAILED = "stat_gating_failed"
    CUSTOM = "custom"


# ===================
# Gating Schema
# ===================

class TimeOfDayConstraint(InteractionBaseModel):
    """Time of day constraint"""
    periods: Optional[List[Literal["morning", "afternoon", "evening", "night"]]] = None
    hour_ranges: Optional[List[Dict[str, int]]] = Field(None, alias="hourRanges")


class StatAxisGate(InteractionBaseModel):
    """Generic stat gating constraint"""
    definition_id: str = Field(alias="definitionId")
    axis: Optional[str] = None
    min_value: Optional[float] = Field(None, alias="minValue")
    max_value: Optional[float] = Field(None, alias="maxValue")
    min_tier_id: Optional[str] = Field(None, alias="minTierId")
    max_tier_id: Optional[str] = Field(None, alias="maxTierId")
    min_level_id: Optional[str] = Field(None, alias="minLevelId")
    entity_type: Literal["npc", "session", "world"] = Field(default="npc", alias="entityType")
    npc_id: Optional[int] = Field(default=None, alias="npcId")


class StatGating(InteractionBaseModel):
    """Stat-based gating constraints (generic)"""
    all_of: Optional[List[StatAxisGate]] = Field(None, alias="allOf")
    any_of: Optional[List[StatAxisGate]] = Field(None, alias="anyOf")


class BehaviorGating(InteractionBaseModel):
    """NPC behavior/state gating constraints"""
    allowed_states: Optional[List[str]] = Field(None, alias="allowedStates")
    forbidden_states: Optional[List[str]] = Field(None, alias="forbiddenStates")
    allowed_activities: Optional[List[str]] = Field(None, alias="allowedActivities")
    forbidden_activities: Optional[List[str]] = Field(None, alias="forbiddenActivities")
    min_simulation_tier: Optional[Literal["dormant", "ambient", "active", "detailed"]] = Field(
        None, alias="minSimulationTier"
    )


class MoodGating(InteractionBaseModel):
    """Mood/emotion gating constraints"""
    allowed_moods: Optional[List[str]] = Field(None, alias="allowedMoods")
    forbidden_moods: Optional[List[str]] = Field(None, alias="forbiddenMoods")
    max_emotion_intensity: Optional[float] = Field(None, ge=0, le=1, alias="maxEmotionIntensity")


class InteractionGating(InteractionBaseModel):
    """Unified gating configuration"""
    stat_gating: Optional[StatGating] = Field(None, alias="statGating")
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

class StatDelta(BaseModel):
    """
    Generic stat delta for applying changes to any stat package.

    This model provides a unified way to describe changes to stats across all stat packages,
    replacing hardcoded stat math with abstract stat system routing through StatEngine.

    Examples:
        # Relationship stat delta (for "core.relationships" package)
        StatDelta(
            package_id="core.relationships",
            definition_id="relationships",
            axes={"affinity": +5.0, "trust": -3.0},
            entity_type="npc",
            npc_id=42
        )

        # Future: Resource stat delta (for "core.resources" package)
        StatDelta(
            package_id="core.resources",
            definition_id="resources",
            axes={"energy": -10.0, "stress": +5.0},
            entity_type="session"
        )
    """
    model_config = ConfigDict(populate_by_name=True)

    package_id: str = Field(
        alias="packageId",
        description="Stat package ID (e.g., 'core.relationships', 'core.resources')"
    )
    definition_id: Optional[str] = Field(
        default=None,
        alias="definitionId",
        description=(
            "Stat definition ID within the package (e.g., 'relationships'). "
            "If omitted and the package defines a single definition, it is inferred."
        ),
    )
    axes: Dict[str, float] = Field(
        description="Map of axis_name -> delta_value (e.g., {'affinity': +5, 'trust': -3})"
    )
    entity_type: Literal["npc", "session", "world"] = Field(
        default="npc",
        alias="entityType",
        description="Entity scope for this stat delta"
    )
    npc_id: Optional[int] = Field(
        default=None,
        alias="npcId",
        description="Required when entity_type == 'npc'. NPC ID to apply stats to."
    )


class FlagChanges(InteractionBaseModel):
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


class InventoryChange(InteractionBaseModel):
    """Single inventory change"""
    item_id: str = Field(alias="itemId")
    quantity: Optional[int] = 1


class InventoryChanges(BaseModel):
    """Inventory changes as a result of interaction"""
    add: Optional[List[InventoryChange]] = None
    remove: Optional[List[InventoryChange]] = None


class MemoryCreation(InteractionBaseModel):
    """Memory creation configuration"""
    topic: str
    summary: str
    importance: Optional[Literal["trivial", "normal", "important", "critical"]] = "normal"
    memory_type: Optional[Literal["short_term", "long_term", "core"]] = Field("short_term", alias="memoryType")
    tags: Optional[List[str]] = None


class EmotionTrigger(InteractionBaseModel):
    """Emotion trigger configuration"""
    emotion: str
    intensity: float = Field(ge=0, le=1)
    duration_seconds: Optional[int] = Field(None, alias="durationSeconds")


class WorldEventRegistration(InteractionBaseModel):
    """World event registration configuration"""
    event_type: str = Field(alias="eventType")
    event_name: str = Field(alias="eventName")
    description: str
    relevance_score: Optional[float] = Field(0.5, ge=0, le=1, alias="relevanceScore")


class NpcEffects(InteractionBaseModel):
    """NPC memory/emotion effects"""
    create_memory: Optional[MemoryCreation] = Field(None, alias="createMemory")
    trigger_emotion: Optional[EmotionTrigger] = Field(None, alias="triggerEmotion")
    register_world_event: Optional[WorldEventRegistration] = Field(None, alias="registerWorldEvent")


class SceneLaunch(InteractionBaseModel):
    """Scene/generation launch configuration"""
    scene_intent_id: Optional[str] = Field(None, alias="sceneIntentId")
    scene_id: Optional[int] = Field(None, alias="sceneId")
    role_bindings: Optional[Dict[str, str]] = Field(None, alias="roleBindings")
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")


class DialogueGeneration(InteractionBaseModel):
    """Dialogue generation configuration"""
    program_id: Optional[str] = Field("default_dialogue", alias="programId")
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")


class GenerationLaunch(InteractionBaseModel):
    """Generation/action block configuration"""
    action_block_ids: Optional[List[str]] = Field(None, alias="actionBlockIds")
    dialogue_request: Optional[DialogueGeneration] = Field(None, alias="dialogueRequest")
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")


class InteractionOutcome(InteractionBaseModel):
    """Unified outcome configuration"""
    stat_deltas: Optional[List[StatDelta]] = Field(None, alias="statDeltas")
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

class NpcInteractionDefinition(InteractionBaseModel):
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


class InteractionContext(InteractionBaseModel):
    """Context snapshot for gating checks"""
    location_id: Optional[int] = Field(None, alias="locationId")
    current_activity_id: Optional[str] = Field(None, alias="currentActivityId")
    state_tags: Optional[List[str]] = Field(None, alias="stateTags")
    mood_tags: Optional[List[str]] = Field(None, alias="moodTags")
    stats_snapshot: Optional[Dict[str, Dict[str, Any]]] = Field(None, alias="statsSnapshot")
    world_time: Optional[int] = Field(None, alias="worldTime")
    session_flags: Optional[Dict[str, Any]] = Field(None, alias="sessionFlags")
    last_used_at: Optional[Dict[str, int]] = Field(None, alias="lastUsedAt")


class NpcInteractionInstance(InteractionBaseModel):
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

class ListInteractionsRequest(InteractionBaseModel):
    """Request to list available interactions"""
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    npc_id: int = Field(alias="npcId")
    location_id: Optional[int] = Field(None, alias="locationId")
    include_unavailable: Optional[bool] = Field(False, alias="includeUnavailable")


class ListInteractionsResponse(InteractionBaseModel):
    """Response with available interactions"""
    interactions: List[NpcInteractionInstance]
    npc_id: int = Field(alias="npcId")
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    timestamp: int


class ExecuteInteractionRequest(InteractionBaseModel):
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


class ExecuteInteractionResponse(InteractionBaseModel):
    """Response from interaction execution"""
    success: bool
    message: Optional[str] = None
    stat_deltas: Optional[List[StatDelta]] = Field(None, alias="statDeltas")
    flag_changes: Optional[List[str]] = Field(None, alias="flagChanges")
    inventory_changes: Optional[InventoryChangeSummary] = Field(None, alias="inventoryChanges")
    launched_scene_id: Optional[int] = Field(None, alias="launchedSceneId")
    generation_request_id: Optional[str] = Field(None, alias="generationRequestId")
    updated_session: Optional[Dict[str, Any]] = Field(None, alias="updatedSession")
    timestamp: int


# ===================
# Storage Schema
# ===================

class WorldInteractionsMetadata(InteractionBaseModel):
    """World-level interaction definitions (in GameWorld.meta.interactions)"""
    definitions: Dict[str, NpcInteractionDefinition]
    role_defaults: Optional[Dict[str, List[str]]] = Field(None, alias="roleDefaults")
    scene_intent_mappings: Optional[Dict[str, int]] = Field(None, alias="sceneIntentMappings")


class NpcInteractionsMetadata(InteractionBaseModel):
    """NPC-level interaction overrides (in GameNPC.meta.interactions)"""
    definition_overrides: Optional[Dict[str, Dict[str, Any]]] = Field(None, alias="definitionOverrides")
    disabled_interactions: Optional[List[str]] = Field(None, alias="disabledInteractions")
    additional_interactions: Optional[List[NpcInteractionDefinition]] = Field(None, alias="additionalInteractions")


class PendingNpcInteraction(InteractionBaseModel):
    """Pending NPC-initiated interaction"""
    interaction_id: str = Field(alias="interactionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")


class SessionInteractionState(InteractionBaseModel):
    """Session-level interaction state (in GameSession.flags.npcs["npc:<id>"].interactions)"""
    last_used_at: Optional[Dict[str, int]] = Field(None, alias="lastUsedAt")
    interaction_state: Optional[Dict[str, Any]] = Field(None, alias="interactionState")
    pending_from_npc: Optional[List[PendingNpcInteraction]] = Field(None, alias="pendingFromNpc")


# ===================
# NPC-Initiated Interactions
# ===================

class NpcInteractionIntent(InteractionBaseModel):
    """NPC-initiated interaction intent"""
    id: str
    npc_id: int = Field(alias="npcId")
    definition_id: str = Field(alias="definitionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")
    priority: Optional[int] = 0
    preferred_surface: Optional[InteractionSurface] = Field(None, alias="preferredSurface")
    context: Optional[Dict[str, Any]] = None
