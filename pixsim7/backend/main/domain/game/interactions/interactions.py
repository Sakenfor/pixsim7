"""
Canonical Interaction Model - Python/Pydantic Schemas

Phase 17.2+: Server-side schemas matching TypeScript types in @pixsim7/types/interactions

Design Principles:
- Mirror TypeScript types exactly for API compatibility
- Use Pydantic for validation and serialization
- Store in GameWorld.meta (no new DB tables)
- Integrate with stat packages, mood, and behavior systems
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional, Literal, Union
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator, field_serializer

# Import canonical BranchIntent from action_blocks (single source of truth)
from pixsim7.backend.main.domain.narrative.action_blocks.types_unified import BranchIntent
from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef


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


def parse_entity_ref(value: Union[str, EntityRef]) -> tuple[str, str]:
    """Parse an entity ref into (kind, raw_id)."""
    if isinstance(value, EntityRef):
        return value.type, str(value.id)
    ref = EntityRef.parse_flexible(value)
    return ref.type, str(ref.id)


def format_entity_ref(kind: str, entity_id: Union[int, str]) -> EntityRef:
    """Format an EntityRef from kind + id."""
    if isinstance(entity_id, str):
        if not entity_id.isdigit():
            raise ValueError(f"EntityRef id must be numeric for kind '{kind}'")
        entity_id = int(entity_id)
    return EntityRef(type=kind, id=entity_id)


def coerce_entity_id(raw_id: str) -> Union[int, str]:
    """Coerce numeric ids to int, otherwise return string."""
    if raw_id.isdigit():
        return int(raw_id)
    return raw_id


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
    GIZMO = "gizmo"  # Interactive gizmo surface (generic surface interaction system)


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
    entity_ref: Optional[EntityRef] = Field(default=None, alias="entityRef")
    npc_id: Optional[int] = Field(default=None, alias="npcId")

    @field_validator("entity_ref", mode="before")
    @classmethod
    def _parse_entity_ref(cls, value: Any) -> Optional[EntityRef]:
        if value is None:
            return None
        if isinstance(value, EntityRef):
            return value
        return EntityRef.parse_flexible(value)

    @field_serializer("entity_ref", when_used="json")
    def _serialize_entity_ref(self, value: Optional[EntityRef]) -> Optional[str]:
        return value.to_string() if value else None


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
    entity_ref: Optional[EntityRef] = Field(
        default=None,
        alias="entityRef",
        description="Canonical entity ref (e.g., 'npc:123')"
    )
    npc_id: Optional[int] = Field(
        default=None,
        alias="npcId",
        description="Required when entity_type == 'npc'. NPC ID to apply stats to."
    )

    @field_validator("entity_ref", mode="before")
    @classmethod
    def _parse_entity_ref(cls, value: Any) -> Optional[EntityRef]:
        if value is None:
            return None
        if isinstance(value, EntityRef):
            return value
        return EntityRef.parse_flexible(value)

    @field_serializer("entity_ref", when_used="json")
    def _serialize_entity_ref(self, value: Optional[EntityRef]) -> Optional[str]:
        return value.to_string() if value else None


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


class TargetEffects(InteractionBaseModel):
    """Target memory/emotion effects (currently NPC-focused)"""
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
    target_effects: Optional[TargetEffects] = Field(None, alias="targetEffects")
    scene_launch: Optional[SceneLaunch] = Field(None, alias="sceneLaunch")
    generation_launch: Optional[GenerationLaunch] = Field(None, alias="generationLaunch")
    narrative_program_id: Optional[str] = Field(None, alias="narrativeProgramId")
    success_message: Optional[str] = Field(None, alias="successMessage")
    failure_message: Optional[str] = Field(None, alias="failureMessage")
    custom_outcome_id: Optional[str] = Field(None, alias="customOutcomeId")


# ===================
# Gizmo Configuration (for surface === 'gizmo')
# ===================

class GizmoConfig(InteractionBaseModel):
    """Configuration for gizmo-based interactions.

    Specifies which surface profile to load and any overrides.
    """
    profile_id: str = Field(alias="profileId", description="Profile ID to load from registry")
    time_limit: Optional[int] = Field(None, alias="timeLimit", description="Override time limit (seconds)")
    instrument_ids: Optional[List[str]] = Field(None, alias="instrumentIds", description="Subset of instruments to enable")
    region_ids: Optional[List[str]] = Field(None, alias="regionIds", description="Subset of regions to enable")
    dimension_ids: Optional[List[str]] = Field(None, alias="dimensionIds", description="Subset of dimensions to track")
    initial_dimensions: Optional[Dict[str, float]] = Field(None, alias="initialDimensions", description="Initial dimension values (0-1)")
    custom_data: Optional[Dict[str, Any]] = Field(None, alias="customData", description="Custom data for the gizmo")


class GizmoSessionResult(InteractionBaseModel):
    """Result of a completed gizmo session.

    Returned by frontend when gizmo interaction completes.
    """
    final_dimensions: Dict[str, float] = Field(alias="finalDimensions", description="Final dimension values")
    completion_type: Literal["success", "timeout", "manual", "cancelled"] = Field(
        alias="completionType",
        description="How the session ended"
    )
    session_duration: float = Field(alias="sessionDuration", description="Total session duration in seconds")
    peak_values: Optional[Dict[str, float]] = Field(None, alias="peakValues", description="Peak values reached")
    instrument_usage: Optional[Dict[str, int]] = Field(None, alias="instrumentUsage", description="Instrument usage counts")
    region_interactions: Optional[Dict[str, int]] = Field(None, alias="regionInteractions", description="Region interaction counts")


# ===================
# Core Interaction Types
# ===================

class InteractionDefinition(InteractionBaseModel):
    """Interaction definition - what designers author"""
    id: str
    label: str
    description: Optional[str] = None
    icon: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    target_roles_or_ids: Optional[List[str]] = Field(None, alias="targetRolesOrIds")
    target_ids: Optional[List[Union[int, str]]] = Field(None, alias="targetIds")
    target_template_kind: Optional[str] = Field(None, alias="targetTemplateKind")
    target_template_id: Optional[str] = Field(None, alias="targetTemplateId")
    target_link_id: Optional[str] = Field(None, alias="targetLinkId")
    participants: Optional[List["InteractionParticipant"]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")
    surface: InteractionSurface
    branch_intent: Optional[BranchIntent] = Field(None, alias="branchIntent")
    gating: Optional[InteractionGating] = None
    outcome: Optional[InteractionOutcome] = None
    plugin_config: Optional[Dict[str, Any]] = Field(None, alias="pluginConfig")
    gizmo_config: Optional[GizmoConfig] = Field(None, alias="gizmoConfig", description="Gizmo configuration (when surface === 'gizmo')")
    underlying_plugin_id: Optional[str] = Field(None, alias="underlyingPluginId")
    priority: Optional[int] = 0
    target_can_initiate: Optional[bool] = Field(False, alias="targetCanInitiate")
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
    participants: Optional[List["InteractionParticipant"]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")


class InteractionTarget(InteractionBaseModel):
    """Interaction target reference"""
    ref: Optional[EntityRef] = None
    kind: Optional[str] = None
    id: Optional[Union[int, str]] = None
    template_kind: Optional[str] = Field(None, alias="templateKind")
    template_id: Optional[str] = Field(None, alias="templateId")
    link_id: Optional[str] = Field(None, alias="linkId")

    @field_validator("ref", mode="before")
    @classmethod
    def _parse_ref(cls, value: Any) -> Optional[EntityRef]:
        if value is None:
            return None
        if isinstance(value, EntityRef):
            return value
        return EntityRef.parse_flexible(value)

    @field_serializer("ref", when_used="json")
    def _serialize_ref(self, value: Optional[EntityRef]) -> Optional[str]:
        return value.to_string() if value else None

    @model_validator(mode="after")
    def _normalize_ref_fields(self) -> "InteractionTarget":
        if self.ref:
            kind = self.ref.type
            raw_id = str(self.ref.id)
            if self.kind and self.kind != kind:
                raise ValueError(f"Target ref kind '{kind}' conflicts with kind '{self.kind}'")
            if self.id is None:
                self.id = coerce_entity_id(raw_id)
            if not self.kind:
                self.kind = kind

        if self.kind and self.id is not None and not self.ref:
            if isinstance(self.id, int) or (isinstance(self.id, str) and self.id.isdigit()):
                self.ref = format_entity_ref(self.kind, self.id)

        return self


class InteractionParticipant(InteractionTarget):
    """Interaction participant with a role label"""
    role: str


class InteractionInstance(InteractionBaseModel):
    """Concrete available interaction at runtime"""
    id: str
    definition_id: str = Field(alias="definitionId")
    target: InteractionTarget
    participants: Optional[List[InteractionParticipant]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")
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
    target: Optional[InteractionTarget] = None
    participants: Optional[List[InteractionParticipant]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")
    location_id: Optional[int] = Field(None, alias="locationId")
    include_unavailable: Optional[bool] = Field(False, alias="includeUnavailable")


class ListInteractionsResponse(InteractionBaseModel):
    """Response with available interactions"""
    interactions: List[InteractionInstance]
    target: Optional[InteractionTarget] = None
    participants: Optional[List[InteractionParticipant]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    timestamp: int


class ExecuteInteractionRequest(InteractionBaseModel):
    """Request to execute an interaction"""
    world_id: int = Field(alias="worldId")
    session_id: int = Field(alias="sessionId")
    target: Optional[InteractionTarget] = None
    participants: Optional[List[InteractionParticipant]] = None
    primary_role: Optional[str] = Field(None, alias="primaryRole")
    interaction_id: str = Field(alias="interactionId")
    player_input: Optional[str] = Field(None, alias="playerInput")
    gizmo_result: Optional[GizmoSessionResult] = Field(None, alias="gizmoResult", description="Result from gizmo session (when surface === 'gizmo')")
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
    gizmo_result: Optional[GizmoSessionResult] = Field(None, alias="gizmoResult", description="Gizmo session result (when surface === 'gizmo')")
    updated_session: Optional[Dict[str, Any]] = Field(None, alias="updatedSession")
    timestamp: int


# ===================
# Storage Schema
# ===================

class WorldInteractionsMetadata(InteractionBaseModel):
    """World-level interaction definitions (in GameWorld.meta.interactions)"""
    definitions: Dict[str, InteractionDefinition]
    role_defaults: Optional[Dict[str, List[str]]] = Field(None, alias="roleDefaults")
    scene_intent_mappings: Optional[Dict[str, int]] = Field(None, alias="sceneIntentMappings")


class TargetInteractionsMetadata(InteractionBaseModel):
    """Target-level interaction overrides (e.g., GameNPC.meta.interactions)"""
    definition_overrides: Optional[Dict[str, Dict[str, Any]]] = Field(None, alias="definitionOverrides")
    disabled_interactions: Optional[List[str]] = Field(None, alias="disabledInteractions")
    additional_interactions: Optional[List[InteractionDefinition]] = Field(None, alias="additionalInteractions")


class PendingInteraction(InteractionBaseModel):
    """Pending target-initiated interaction"""
    interaction_id: str = Field(alias="interactionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")


class SessionInteractionState(InteractionBaseModel):
    """Session-level interaction state (currently stored under GameSession.flags.npcs)."""
    last_used_at: Optional[Dict[str, int]] = Field(None, alias="lastUsedAt")
    interaction_state: Optional[Dict[str, Any]] = Field(None, alias="interactionState")
    pending_from_target: Optional[List[PendingInteraction]] = Field(None, alias="pendingFromTarget")


# ===================
# Target-Initiated Interactions
# ===================

class InteractionIntent(InteractionBaseModel):
    """Target-initiated interaction intent"""
    id: str
    target: InteractionTarget
    definition_id: str = Field(alias="definitionId")
    created_at: int = Field(alias="createdAt")
    expires_at: Optional[int] = Field(None, alias="expiresAt")
    priority: Optional[int] = 0
    preferred_surface: Optional[InteractionSurface] = Field(None, alias="preferredSurface")
    context: Optional[Dict[str, Any]] = None
