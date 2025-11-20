from __future__ import annotations

"""
NPC Behavior System Schemas (Task 13)

Activity, routine, condition, effect, and scoring configuration schemas.
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

CURRENT_BEHAVIOR_VERSION = 1


class ConditionSchema(BaseModel):
    """
    Condition DSL schema for behavior system.

    Supports built-in condition types and extensible custom conditions.
    """

    type: str
    # Common optional fields
    npcIdOrRole: Optional[str] = None
    metric: Optional[str] = None
    threshold: Optional[float] = None
    key: Optional[str] = None
    value: Optional[object] = None
    moodTags: Optional[List[str]] = None
    min: Optional[float] = None
    max: Optional[float] = None
    probability: Optional[float] = None
    times: Optional[List[str]] = None
    locationTypes: Optional[List[str]] = None
    evaluatorId: Optional[str] = None
    params: Optional[Dict] = None
    expression: Optional[str] = None

    @field_validator('probability')
    @classmethod
    def validate_probability(cls, v: Optional[float]) -> Optional[float]:
        """Ensure probability is between 0 and 1."""
        if v is not None and (v < 0 or v > 1):
            raise ValueError('probability must be between 0 and 1')
        return v

    @field_validator('threshold')
    @classmethod
    def validate_threshold(cls, v: Optional[float]) -> Optional[float]:
        """Ensure threshold is between 0 and 100 for relationship metrics."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('threshold must be between 0 and 100')
        return v

    class Config:
        extra = "allow"  # Allow additional fields for custom conditions


class ActivityCategoryConfigSchema(BaseModel):
    """User-defined activity category configuration."""

    id: str
    label: str
    icon: Optional[str] = None
    defaultWeight: Optional[float] = Field(default=0.5, ge=0, le=1)
    description: Optional[str] = None
    meta: Optional[Dict] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure category ID is not empty."""
        if not v or not v.strip():
            raise ValueError('Category ID cannot be empty')
        return v.strip()


class RelationshipDeltaSchema(BaseModel):
    """Relationship delta for activity effects."""

    affinity: Optional[float] = Field(default=None, ge=-100, le=100)
    trust: Optional[float] = Field(default=None, ge=-100, le=100)
    chemistry: Optional[float] = Field(default=None, ge=-100, le=100)
    tension: Optional[float] = Field(default=None, ge=-100, le=100)


class CustomEffectSchema(BaseModel):
    """Custom effect for extensibility."""

    type: str
    params: Dict = Field(default_factory=dict)

    @field_validator('type')
    @classmethod
    def type_not_empty(cls, v: str) -> str:
        """Ensure effect type is not empty."""
        if not v or not v.strip():
            raise ValueError('Effect type cannot be empty')
        return v.strip()


class ActivityEffectsSchema(BaseModel):
    """Activity effects applied when NPC performs an activity."""

    energyDeltaPerHour: Optional[float] = Field(default=None, ge=-100, le=100)
    moodImpact: Optional[Dict[str, float]] = None  # {valence, arousal}
    relationshipChanges: Optional[Dict[str, RelationshipDeltaSchema]] = None
    flagsSet: Optional[Dict] = None
    customEffects: Optional[List[CustomEffectSchema]] = None

    @field_validator('moodImpact')
    @classmethod
    def validate_mood_impact(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Validate mood impact valence and arousal."""
        if v is not None:
            if 'valence' in v and (v['valence'] < -100 or v['valence'] > 100):
                raise ValueError('moodImpact.valence must be between -100 and 100')
            if 'arousal' in v and (v['arousal'] < -100 or v['arousal'] > 100):
                raise ValueError('moodImpact.arousal must be between -100 and 100')
        return v


class ActivityRequirementsSchema(BaseModel):
    """Activity requirements (gates for when activity is available)."""

    locationTypes: Optional[List[str]] = None
    requiredNpcRolesOrIds: Optional[List[str]] = None
    minEnergy: Optional[float] = Field(default=None, ge=0, le=100)
    maxEnergy: Optional[float] = Field(default=None, ge=0, le=100)
    moodTags: Optional[List[str]] = None
    timeOfDay: Optional[List[str]] = None
    conditions: Optional[List[ConditionSchema]] = None


class ActivityVisualMetaSchema(BaseModel):
    """Visual/presentation metadata for activities."""

    animationId: Optional[str] = None
    dialogueContext: Optional[str] = None
    actionBlocks: Optional[List[str]] = None
    sceneIntent: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class ActivitySchema(BaseModel):
    """Activity template definition."""

    version: int = Field(default=1, ge=1)
    id: str
    name: str
    category: str

    requirements: Optional[ActivityRequirementsSchema] = None
    effects: Optional[ActivityEffectsSchema] = None
    visual: Optional[ActivityVisualMetaSchema] = None

    minDurationSeconds: Optional[float] = Field(default=None, ge=0)
    cooldownSeconds: Optional[float] = Field(default=None, ge=0)
    priority: Optional[float] = Field(default=0)

    meta: Optional[Dict] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure activity ID is not empty."""
        if not v or not v.strip():
            raise ValueError('Activity ID cannot be empty')
        return v.strip()

    @field_validator('category')
    @classmethod
    def category_not_empty(cls, v: str) -> str:
        """Ensure category is not empty."""
        if not v or not v.strip():
            raise ValueError('Category cannot be empty')
        return v.strip()


class NpcTraitModifiersSchema(BaseModel):
    """NPC personality trait modifiers (0-100 scale)."""

    extraversion: Optional[float] = Field(default=None, ge=0, le=100)
    conscientiousness: Optional[float] = Field(default=None, ge=0, le=100)
    openness: Optional[float] = Field(default=None, ge=0, le=100)
    agreeableness: Optional[float] = Field(default=None, ge=0, le=100)
    neuroticism: Optional[float] = Field(default=None, ge=0, le=100)


class NpcPreferencesSchema(BaseModel):
    """NPC preferences configuration."""

    activityWeights: Optional[Dict[str, float]] = None
    categoryWeights: Optional[Dict[str, float]] = None
    preferredNpcIdsOrRoles: Optional[List[str]] = None
    avoidedNpcIdsOrRoles: Optional[List[str]] = None
    favoriteLocations: Optional[List[str]] = None
    morningPerson: Optional[bool] = None
    nightOwl: Optional[bool] = None
    traitModifiers: Optional[NpcTraitModifiersSchema] = None
    meta: Optional[Dict] = None

    @field_validator('activityWeights')
    @classmethod
    def validate_activity_weights(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Ensure activity weights are between 0 and 1."""
        if v is not None:
            for key, weight in v.items():
                if weight < 0 or weight > 1:
                    raise ValueError(f'Activity weight for "{key}" must be between 0 and 1')
        return v

    @field_validator('categoryWeights')
    @classmethod
    def validate_category_weights(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Ensure category weights are between 0 and 1."""
        if v is not None:
            for key, weight in v.items():
                if weight < 0 or weight > 1:
                    raise ValueError(f'Category weight for "{key}" must be between 0 and 1')
        return v


class PreferredActivitySchema(BaseModel):
    """Preferred activity entry in routine graph nodes."""

    activityId: str
    weight: float = Field(ge=0, le=10)  # Allow weights > 1 for strong preferences
    conditions: Optional[List[ConditionSchema]] = None


class RoutineNodeSchema(BaseModel):
    """Routine graph node."""

    id: str
    nodeType: str  # 'time_slot', 'decision', 'activity'
    timeRangeSeconds: Optional[Dict[str, float]] = None  # {start, end}
    preferredActivities: Optional[List[PreferredActivitySchema]] = None
    decisionConditions: Optional[List[ConditionSchema]] = None
    meta: Optional[Dict] = None

    @field_validator('nodeType')
    @classmethod
    def validate_node_type(cls, v: str) -> str:
        """Ensure node type is valid."""
        valid_types = ['time_slot', 'decision', 'activity']
        if v not in valid_types:
            raise ValueError(f'nodeType must be one of {valid_types}')
        return v

    @field_validator('timeRangeSeconds')
    @classmethod
    def validate_time_range(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Validate time range has start and end."""
        if v is not None:
            if 'start' not in v or 'end' not in v:
                raise ValueError('timeRangeSeconds must have "start" and "end" fields')
            if v['start'] < 0 or v['end'] < 0:
                raise ValueError('timeRangeSeconds values must be non-negative')
            if v['start'] >= v['end']:
                raise ValueError('timeRangeSeconds.start must be less than end')
        return v


class RoutineEdgeSchema(BaseModel):
    """Routine graph edge."""

    fromNodeId: str
    toNodeId: str
    conditions: Optional[List[ConditionSchema]] = None
    weight: Optional[float] = Field(default=1.0, ge=0)
    transitionEffects: Optional[ActivityEffectsSchema] = None
    meta: Optional[Dict] = None


class RoutineGraphSchema(BaseModel):
    """Routine graph definition."""

    version: int = Field(default=1, ge=1)
    id: str
    name: str
    nodes: List[RoutineNodeSchema]
    edges: List[RoutineEdgeSchema]
    defaultPreferences: Optional[NpcPreferencesSchema] = None
    meta: Optional[Dict] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure routine ID is not empty."""
        if not v or not v.strip():
            raise ValueError('Routine ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_graph_structure(self):
        """Validate graph structure (nodes referenced in edges exist)."""
        node_ids = {node.id for node in self.nodes}
        for edge in self.edges:
            if edge.fromNodeId not in node_ids:
                raise ValueError(f'Edge references non-existent fromNodeId: {edge.fromNodeId}')
            if edge.toNodeId not in node_ids:
                raise ValueError(f'Edge references non-existent toNodeId: {edge.toNodeId}')
        return self


class ScoringWeightsSchema(BaseModel):
    """Scoring system weights."""

    baseWeight: float = Field(default=1.0, ge=0, le=10)
    activityPreference: float = Field(default=1.0, ge=0, le=10)
    categoryPreference: float = Field(default=0.8, ge=0, le=10)
    traitModifier: float = Field(default=0.6, ge=0, le=10)
    moodCompatibility: float = Field(default=0.7, ge=0, le=10)
    relationshipBonus: float = Field(default=0.5, ge=0, le=10)
    urgency: float = Field(default=1.2, ge=0, le=10)
    inertia: float = Field(default=0.3, ge=0, le=10)


class ScoringConfigSchema(BaseModel):
    """Scoring system configuration."""

    version: int = Field(default=1, ge=1)
    weights: ScoringWeightsSchema = Field(default_factory=ScoringWeightsSchema)
    customScoringId: Optional[str] = None
    meta: Optional[Dict] = None


class SimulationTierSchema(BaseModel):
    """Simulation tier configuration (game-agnostic)."""

    id: str
    tickFrequencySeconds: float = Field(ge=0)
    detailLevel: str
    meta: Optional[Dict] = None

    @field_validator('detailLevel')
    @classmethod
    def validate_detail_level(cls, v: str) -> str:
        """Ensure detail level is valid."""
        valid_levels = ['full', 'simplified', 'schedule_only']
        if v not in valid_levels:
            raise ValueError(f'detailLevel must be one of {valid_levels}')
        return v


class SimulationPriorityRuleSchema(BaseModel):
    """Priority rule for NPC simulation."""

    condition: ConditionSchema
    tier: str
    priority: float = Field(ge=0)


class SimulationConfigSchema(BaseModel):
    """Simulation configuration (game-agnostic)."""

    version: int = Field(default=1, ge=1)
    tiers: List[SimulationTierSchema]
    priorityRules: List[SimulationPriorityRuleSchema]
    defaultTier: str
    maxNpcsPerTick: Optional[int] = Field(default=None, ge=1)
    meta: Optional[Dict] = None

    @model_validator(mode='after')
    def validate_tier_references(self):
        """Ensure priority rules reference valid tiers."""
        tier_ids = {tier.id for tier in self.tiers}
        if self.defaultTier not in tier_ids:
            raise ValueError(f'defaultTier "{self.defaultTier}" not found in tiers')
        for rule in self.priorityRules:
            if rule.tier not in tier_ids:
                raise ValueError(f'Priority rule references non-existent tier: {rule.tier}')
        return self


class CustomConditionEvaluatorSchema(BaseModel):
    """Custom condition evaluator configuration."""

    id: str
    description: Optional[str] = None
    implementation: Optional[str] = None
    code: Optional[str] = None
    meta: Optional[Dict] = None


class CustomEffectHandlerSchema(BaseModel):
    """Custom effect handler configuration."""

    id: str
    description: Optional[str] = None
    implementation: Optional[str] = None
    code: Optional[str] = None
    meta: Optional[Dict] = None


class NpcPreferencePresetSchema(BaseModel):
    """NPC behavior configuration preset."""

    id: str
    name: str
    description: Optional[str] = None
    preferences: NpcPreferencesSchema
    tags: Optional[List[str]] = None
    meta: Optional[Dict] = None


class BehaviorConfigSchema(BaseModel):
    """
    Complete behavior configuration for a world.
    Stored in GameWorld.meta.behavior
    """

    version: int = Field(default=CURRENT_BEHAVIOR_VERSION, ge=1)
    activityCategories: Optional[Dict[str, ActivityCategoryConfigSchema]] = None
    activities: Optional[Dict[str, ActivitySchema]] = None
    routines: Optional[Dict[str, RoutineGraphSchema]] = None
    scoringConfig: Optional[ScoringConfigSchema] = None
    simulationConfig: Optional[SimulationConfigSchema] = None
    customConditionEvaluators: Optional[Dict[str, CustomConditionEvaluatorSchema]] = None
    customEffectHandlers: Optional[Dict[str, CustomEffectHandlerSchema]] = None
    presets: Optional[Dict] = None
    meta: Optional[Dict] = None

    @model_validator(mode='after')
    def validate_activity_categories(self):
        """Ensure activities reference defined categories."""
        if self.activities and self.activityCategories:
            defined_categories = set(self.activityCategories.keys())
            for activity_id, activity in self.activities.items():
                if activity.category not in defined_categories:
                    raise ValueError(
                        f'Activity "{activity_id}" references undefined category "{activity.category}". '
                        f'Define it in activityCategories first.'
                    )
        return self

    @model_validator(mode='after')
    def validate_routine_activity_references(self):
        """Ensure routine graphs reference defined activities."""
        if self.routines and self.activities:
            defined_activities = set(self.activities.keys())
            for routine_id, routine in self.routines.items():
                for node in routine.nodes:
                    if node.preferredActivities:
                        for pref_activity in node.preferredActivities:
                            if pref_activity.activityId not in defined_activities:
                                raise ValueError(
                                    f'Routine "{routine_id}" node "{node.id}" references '
                                    f'undefined activity "{pref_activity.activityId}"'
                                )
        return self

    class Config:
        extra = "ignore"  # Allow additional fields for future extensibility


# Migration helpers for behavior config version upgrades
def auto_migrate_behavior_config(config: Dict) -> Dict:
    """
    Automatically migrate behavior config to latest version.

    Currently at version 1, so no migrations needed yet.
    Future versions will add migration logic here.
    """
    version = config.get('version', 1)

    # Future migrations will be added here as:
    # if version < 2:
    #     config = migrate_behavior_to_v2(config)
    #     version = 2
    # if version < 3:
    #     config = migrate_behavior_to_v3(config)
    #     version = 3

    # Ensure version is set
    config['version'] = version

    return config


# ===================
# ECS Component Schemas (Task 19)
# ===================
