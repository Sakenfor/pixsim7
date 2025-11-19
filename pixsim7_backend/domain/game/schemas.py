from __future__ import annotations

"""
Pydantic models for validating world-level relationship/intimacy schemas.

These models intentionally cover only the schema-related portions of
GameWorld.meta and ignore any unrelated fields (UI config, generation, etc.).
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def detect_tier_overlaps(tiers: List["RelationshipTierSchema"]) -> List[str]:
    """
    Detect overlapping tier ranges.

    Returns list of overlap descriptions, empty if no overlaps.
    """
    overlaps = []
    sorted_tiers = sorted(tiers, key=lambda t: t.min)

    for i, tier1 in enumerate(sorted_tiers):
        for tier2 in sorted_tiers[i + 1 :]:
            # Check if ranges overlap
            tier1_max = tier1.max if tier1.max is not None else 100
            tier2_max = tier2.max if tier2.max is not None else 100

            if tier1_max > tier2.min:
                overlaps.append(
                    f'Tiers "{tier1.id}" ({tier1.min}-{tier1_max}) '
                    f'and "{tier2.id}" ({tier2.min}-{tier2_max}) overlap'
                )

    return overlaps


def detect_tier_gaps(tiers: List["RelationshipTierSchema"]) -> List[str]:
    """
    Detect gaps in tier coverage (optional warning, not error).

    Returns list of gap descriptions.
    """
    gaps = []
    sorted_tiers = sorted(tiers, key=lambda t: t.min)

    for i in range(len(sorted_tiers) - 1):
        tier1 = sorted_tiers[i]
        tier2 = sorted_tiers[i + 1]
        tier1_max = tier1.max if tier1.max is not None else 100

        if tier1_max < tier2.min:
            gaps.append(
                f'Gap between "{tier1.id}" (ends at {tier1_max}) '
                f'and "{tier2.id}" (starts at {tier2.min})'
            )

    return gaps


class RelationshipTierSchema(BaseModel):
    """
    Schema entry for a single relationship tier.

    Example:
    {
        "id": "friend",
        "min": 40,
        "max": 69
    }
    """

    id: str
    min: float
    max: Optional[float] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure tier ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Tier ID cannot be empty')
        return v.strip()

    @field_validator('min')
    @classmethod
    def min_in_range(cls, v: float) -> float:
        """Ensure min value is between 0 and 100."""
        if v < 0 or v > 100:
            raise ValueError('min must be between 0 and 100')
        return v

    @field_validator('max')
    @classmethod
    def max_in_range(cls, v: Optional[float]) -> Optional[float]:
        """Ensure max value is between 0 and 100 if provided."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('max must be between 0 and 100')
        return v

    @model_validator(mode='after')
    def validate_min_max_relationship(self):
        """Ensure max >= min when max is specified."""
        if self.max is not None and self.max < self.min:
            raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
        return self


class IntimacyLevelSchema(BaseModel):
    """
    Schema entry for a single intimacy level.

    Example (stored under GameWorld.meta.intimacy_schema.levels):
    {
        "id": "light_flirt",
        "minAffinity": 30,
        "minTrust": 20,
        "minChemistry": 30,
        "maxTension": 40
    }
    """

    id: str
    minAffinity: Optional[float] = None
    minTrust: Optional[float] = None
    minChemistry: Optional[float] = None
    maxTension: Optional[float] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure intimacy level ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Intimacy level ID cannot be empty')
        return v.strip()

    @field_validator('minAffinity', 'minTrust', 'minChemistry', 'maxTension')
    @classmethod
    def value_in_range(cls, v: Optional[float]) -> Optional[float]:
        """Ensure threshold values are between 0 and 100 if provided."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError(f'Value must be between 0 and 100, got {v}')
        return v

    @model_validator(mode='after')
    def has_at_least_one_threshold(self):
        """Ensure at least one threshold is defined."""
        if not any([
            self.minAffinity is not None,
            self.minTrust is not None,
            self.minChemistry is not None,
            self.maxTension is not None
        ]):
            raise ValueError('Intimacy level must have at least one threshold defined')
        return self


class IntimacySchema(BaseModel):
    """
    Container for intimacy level schemas.

    Matches the structure:
    GameWorld.meta.intimacy_schema = { "levels": [IntimacyLevelSchema, ...] }
    """

    levels: List[IntimacyLevelSchema] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_unique_ids(self):
        """Ensure all intimacy level IDs are unique."""
        ids = [level.id for level in self.levels]
        duplicates = [id for id in ids if ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate intimacy level IDs found: {set(duplicates)}')
        return self


class GeneralMoodSchema(BaseModel):
    """
    General mood definition using valence/arousal ranges.

    Example:
    {
        "id": "excited",
        "valence_min": 50,
        "valence_max": 100,
        "arousal_min": 50,
        "arousal_max": 100
    }
    """

    id: str
    valence_min: float = Field(ge=0, le=100)
    valence_max: float = Field(ge=0, le=100)
    arousal_min: float = Field(ge=0, le=100)
    arousal_max: float = Field(ge=0, le=100)

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure mood ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Mood ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_ranges(self):
        """Ensure max >= min for valence and arousal."""
        if self.valence_max < self.valence_min:
            raise ValueError(
                f'valence_max ({self.valence_max}) must be >= valence_min ({self.valence_min})'
            )
        if self.arousal_max < self.arousal_min:
            raise ValueError(
                f'arousal_max ({self.arousal_max}) must be >= arousal_min ({self.arousal_min})'
            )
        return self


class IntimateMoodSchema(BaseModel):
    """
    Intimate mood definition using relationship axes.

    Example:
    {
        "id": "playful",
        "chemistry_min": 0,
        "chemistry_max": 60,
        "trust_min": 0,
        "trust_max": 100,
        "tension_min": 0,
        "tension_max": 100
    }
    """

    id: str
    chemistry_min: float = Field(default=0, ge=0, le=100)
    chemistry_max: float = Field(default=100, ge=0, le=100)
    trust_min: float = Field(default=0, ge=0, le=100)
    trust_max: float = Field(default=100, ge=0, le=100)
    tension_min: float = Field(default=0, ge=0, le=100)
    tension_max: float = Field(default=100, ge=0, le=100)

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure mood ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Mood ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_ranges(self):
        """Ensure max >= min for all axes."""
        if self.chemistry_max < self.chemistry_min:
            raise ValueError('chemistry_max must be >= chemistry_min')
        if self.trust_max < self.trust_min:
            raise ValueError('trust_max must be >= trust_min')
        if self.tension_max < self.tension_min:
            raise ValueError('tension_max must be >= tension_min')
        return self


class MoodSchemaConfig(BaseModel):
    """
    Container for mood schemas (supports both legacy and domain-based formats).

    Domain-based format (new):
    {
        "general": {"moods": [GeneralMoodSchema, ...]},
        "intimate": {"moods": [IntimateMoodSchema, ...]}
    }

    Legacy format:
    {
        "moods": [GeneralMoodSchema, ...]
    }
    """

    # Legacy format
    moods: Optional[List[GeneralMoodSchema]] = None

    # Domain-based format
    general: Optional[Dict[str, List[GeneralMoodSchema]]] = None
    intimate: Optional[Dict[str, List[IntimateMoodSchema]]] = None

    @model_validator(mode='after')
    def has_at_least_one_format(self):
        """Ensure at least one format is provided."""
        if self.moods is None and self.general is None and self.intimate is None:
            raise ValueError(
                'Mood schema must have either legacy "moods" or domain-based "general"/"intimate"'
            )
        return self

    @model_validator(mode='after')
    def validate_no_duplicate_ids(self):
        """Ensure no duplicate mood IDs across all formats."""
        all_ids = []

        # Collect IDs from legacy format
        if self.moods:
            all_ids.extend([m.id for m in self.moods])

        # Collect IDs from domain-based format
        if self.general and 'moods' in self.general:
            all_ids.extend([m.id for m in self.general['moods']])
        if self.intimate and 'moods' in self.intimate:
            all_ids.extend([m.id for m in self.intimate['moods']])

        duplicates = [id for id in all_ids if all_ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate mood IDs found: {set(duplicates)}')
        return self


class ReputationBandSchema(BaseModel):
    """
    Schema entry for a single reputation band.

    Example:
    {
        "id": "enemy",
        "min": 0,
        "max": 20,
        "label": "Enemy"
    }
    """

    id: str
    min: float = Field(ge=0, le=100)
    max: float = Field(ge=0, le=100)
    label: Optional[str] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure reputation band ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Reputation band ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_min_max(self):
        """Ensure max >= min."""
        if self.max < self.min:
            raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
        return self


class ReputationSchemaConfig(BaseModel):
    """
    Container for reputation bands, can be target-type-specific.

    Example:
    {
        "bands": [ReputationBandSchema, ...]
    }
    """

    bands: List[ReputationBandSchema] = Field(min_length=1)

    @field_validator('bands')
    @classmethod
    def bands_not_empty(cls, v: List[ReputationBandSchema]) -> List[ReputationBandSchema]:
        """Ensure at least one reputation band is defined."""
        if not v:
            raise ValueError('Reputation schema must have at least one band')
        return v

    @model_validator(mode='after')
    def validate_unique_ids(self):
        """Ensure all reputation band IDs are unique."""
        ids = [band.id for band in self.bands]
        duplicates = [id for id in ids if ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate reputation band IDs found: {set(duplicates)}')
        return self


# Phase 19: Schema Versioning
CURRENT_SCHEMA_VERSION = 1


class WorldMetaSchemas(BaseModel):
    """
    World-level relationship and intimacy schemas inside GameWorld.meta.

    Only validates known fields and ignores any extra keys so that other
    systems (UI config, generation config, etc.) can evolve independently.
    """

    schema_version: int = Field(default=CURRENT_SCHEMA_VERSION)
    relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(
        default_factory=dict
    )
    intimacy_schema: Optional[IntimacySchema] = None
    npc_mood_schema: Optional[MoodSchemaConfig] = None
    reputation_schemas: Optional[Dict[str, ReputationSchemaConfig]] = None
    # Key = target type ("default", "npc", "faction", "group", etc.)

    @model_validator(mode='after')
    def check_version_compatibility(self):
        """Check schema version and log deprecation warnings."""
        if self.schema_version < CURRENT_SCHEMA_VERSION:
            # Note: In production, this would log to a logger
            # For now, we just allow it but note the deprecation
            pass
        return self

    @model_validator(mode='after')
    def validate_relationship_schemas(self):
        """Validate relationship schemas for duplicate IDs and overlaps within each schema."""
        for schema_key, tiers in self.relationship_schemas.items():
            # Check for duplicate IDs
            ids = [t.id for t in tiers]
            duplicates = [id for id in ids if ids.count(id) > 1]
            if duplicates:
                raise ValueError(
                    f'Duplicate tier IDs in relationship schema "{schema_key}": '
                    f'{set(duplicates)}'
                )

            # Check for overlaps
            overlaps = detect_tier_overlaps(tiers)
            if overlaps:
                raise ValueError(
                    f'Overlapping tiers in relationship schema "{schema_key}": '
                    f'{"; ".join(overlaps)}'
                )
        return self

    class Config:
        extra = "ignore"


# Migration helpers for schema version upgrades
def auto_migrate_schema(schema: Dict) -> Dict:
    """
    Automatically migrate schema to latest version.

    Currently at version 1, so no migrations needed yet.
    Future versions will add migration logic here.

    Example migration (for future reference):
    version = schema.get('schema_version', 1)
    if version < 2:
        schema = migrate_schema_to_v2(schema)
    return schema
    """
    version = schema.get('schema_version', 1)

    # Future migrations will be added here as:
    # if version < 2:
    #     schema = migrate_schema_to_v2(schema)
    #     version = 2
    # if version < 3:
    #     schema = migrate_schema_to_v3(schema)
    #     version = 3

    # Ensure version is set
    schema['schema_version'] = version

    return schema


# ===================
# NPC Behavior System Schemas (Task 13)
# ===================

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


class MetricDefinitionSchema(BaseModel):
    """
    Metric definition schema for the metric registry.
    Defines how to find and interpret a metric value.
    """

    id: str = Field(description="Metric ID (e.g., 'npcRelationship.affinity')")
    type: str = Field(description="Metric type: float, int, enum, boolean")
    min: Optional[float] = Field(None, description="Minimum value (for numeric types)")
    max: Optional[float] = Field(None, description="Maximum value (for numeric types)")
    values: Optional[List[str]] = Field(None, description="Allowed values (for enum types)")
    component: str = Field(description="Component where this metric lives")
    path: Optional[str] = Field(None, description="Path within component (dot notation)")
    source: Optional[str] = Field(None, description="Source plugin ID")
    label: Optional[str] = Field(None, description="Human-readable label")
    description: Optional[str] = Field(None, description="Description")

    @field_validator('type')
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Ensure type is one of the allowed values."""
        allowed_types = {'float', 'int', 'enum', 'boolean'}
        if v not in allowed_types:
            raise ValueError(f'type must be one of {allowed_types}')
        return v

    class Config:
        extra = "allow"


class MetricRegistrySchema(BaseModel):
    """
    Metric registry configuration schema.
    Stored in GameWorld.meta.metrics
    """

    npcRelationship: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="NPC relationship metrics")
    npcBehavior: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="NPC behavior metrics")
    playerState: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="Player state metrics")
    worldState: Optional[Dict[str, MetricDefinitionSchema]] = Field(None, description="World state metrics")

    class Config:
        extra = "allow"  # Allow custom metric categories


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

