from __future__ import annotations

"""
NPC Behavior System Schemas (Task 13)

Activity, routine, condition, effect, and scoring configuration schemas.
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

CURRENT_BEHAVIOR_VERSION = 2  # v2: Added personality archetypes

# Feature flags for gradual rollout
FEATURE_FLAGS = {
    "archetype_scoring": True,  # Enable archetype-based activity scoring
    "behavior_profiles": True,  # Plugin behavior profiles (Phase 3)
    "trait_effects": True,  # Trait-to-behavior mapping (Phase 4)
}


# ===================
# Semantic Trait Levels (Phase 1)
# ===================

# Map semantic levels to numeric multipliers for scoring
TRAIT_LEVEL_VALUES = {
    "very_low": 0.2,
    "low": 0.4,
    "medium": 0.6,
    "high": 0.8,
    "very_high": 1.0,
}

TraitLevel = Literal["very_low", "low", "medium", "high", "very_high"]


# ===================
# Personality Archetype Schemas (Phase 1)
# ===================


# ===================
# Trait Effect Mapping Schemas (Phase 4)
# ===================


class TraitEffectType(str, Enum):
    """Types of effects that traits can have on behavior."""
    # Activity preferences
    ACTIVITY_PREFERENCE = "activity_preference"  # Adds tags to comfortable/uncomfortable
    CATEGORY_WEIGHT = "category_weight"  # Multiplies category weights

    # Energy/stamina
    ENERGY_DRAIN_RATE = "energy_drain_rate"  # How fast energy depletes
    ENERGY_RECOVERY_RATE = "energy_recovery_rate"  # How fast energy recovers
    SOCIAL_ENERGY_DRAIN = "social_energy_drain"  # Energy drain from social activities

    # Decision making
    DECISION_SPEED = "decision_speed"  # How quickly NPC makes decisions
    VARIETY_SEEKING = "variety_seeking"  # Preference for trying new activities
    ROUTINE_PREFERENCE = "routine_preference"  # Preference for familiar activities

    # Social
    SOCIAL_INITIATION = "social_initiation"  # Likelihood to start conversations
    GROUP_SIZE_PREFERENCE = "group_size_preference"  # Preferred group size

    # Mood
    MOOD_VOLATILITY = "mood_volatility"  # How quickly mood changes
    BASELINE_MOOD = "baseline_mood"  # Default mood tendency

    # Custom (for plugins)
    CUSTOM = "custom"


# Semantic value levels for trait effects
TraitEffectValue = Literal[
    "very_slow", "slow", "normal", "fast", "very_fast",  # For rates
    "very_low", "low", "medium", "high", "very_high",  # For amounts
    "avoided", "uncomfortable", "neutral", "comfortable", "preferred",  # For preferences
    "solo", "small", "medium", "large", "any",  # For group sizes
]

# Map semantic values to numeric multipliers
TRAIT_EFFECT_VALUE_MULTIPLIERS = {
    # Rate multipliers
    "very_slow": 0.25,
    "slow": 0.5,
    "normal": 1.0,
    "fast": 1.5,
    "very_fast": 2.0,
    # Amount multipliers
    "very_low": 0.2,
    "low": 0.5,
    "medium": 1.0,
    "high": 1.5,
    "very_high": 2.0,
    # Preference multipliers (for activity weights)
    "avoided": 0.1,
    "uncomfortable": 0.4,
    "neutral": 1.0,
    "comfortable": 1.4,
    "preferred": 2.0,
}


class TraitEffectDefinitionSchema(BaseModel):
    """
    A single effect that a trait level produces.

    Example:
        {"type": "social_energy_drain", "value": "fast"}
        {"type": "activity_preference", "tags": ["solitary"], "modifier": "preferred"}
    """
    type: str = Field(description="Effect type (from TraitEffectType or custom)")
    value: Optional[str] = Field(default=None, description="Semantic value (fast, slow, high, low, etc.)")

    # For activity_preference type
    tags: Optional[List[str]] = Field(default=None, description="Activity/category tags affected")
    modifier: Optional[str] = Field(default=None, description="How tags are affected (comfortable, uncomfortable, etc.)")

    # For category_weight type
    categories: Optional[Dict[str, str]] = Field(
        default=None,
        description="Category -> semantic weight (e.g., {'social': 'low', 'solitary': 'high'})"
    )

    # For custom effects
    custom_data: Optional[Dict[str, Any]] = Field(default=None, description="Custom effect data for plugins")


class TraitLevelEffectsSchema(BaseModel):
    """
    Effects produced when a trait is at a specific level.

    Example for introversion=high:
        effects:
          - type: social_energy_drain
            value: fast
          - type: activity_preference
            tags: [reading, solitary_walk]
            modifier: preferred
          - type: category_weight
            categories: {social: low, solitary: high}
    """
    effects: List[TraitEffectDefinitionSchema] = Field(
        default_factory=list,
        description="List of effects produced at this trait level"
    )


class TraitEffectMappingSchema(BaseModel):
    """
    Complete mapping of a trait to its behavioral effects.

    Maps each semantic level (very_low, low, medium, high, very_high)
    to a set of effects.

    Example:
        trait_id: introversion
        levels:
          high:
            effects:
              - type: social_energy_drain
                value: fast
              - type: activity_preference
                tags: [solitary]
                modifier: preferred
          low:
            effects:
              - type: social_energy_drain
                value: slow
              - type: activity_preference
                tags: [parties, group_activities]
                modifier: preferred
    """
    traitId: str = Field(description="Trait identifier (e.g., 'introversion', 'neuroticism')")
    description: Optional[str] = Field(default=None, description="Human-readable description")

    # Effects per level
    very_low: Optional[TraitLevelEffectsSchema] = Field(default=None)
    low: Optional[TraitLevelEffectsSchema] = Field(default=None)
    medium: Optional[TraitLevelEffectsSchema] = Field(default=None)
    high: Optional[TraitLevelEffectsSchema] = Field(default=None)
    very_high: Optional[TraitLevelEffectsSchema] = Field(default=None)

    def get_effects_for_level(self, level: str) -> List[TraitEffectDefinitionSchema]:
        """Get effects for a specific trait level."""
        level_effects = getattr(self, level.replace("-", "_"), None)
        if level_effects:
            return level_effects.effects
        return []


class TraitEffectConfigSchema(BaseModel):
    """
    World-level trait effect configuration.

    Stored in GameWorld.meta.behavior.traitEffects
    """
    version: int = Field(default=1, ge=1)

    # Trait mappings: trait_id -> mapping
    mappings: Dict[str, TraitEffectMappingSchema] = Field(
        default_factory=dict,
        description="Trait effect mappings"
    )

    # Default effects applied to all NPCs (before archetype/trait-specific)
    defaultEffects: Optional[List[TraitEffectDefinitionSchema]] = Field(
        default=None,
        description="Default effects for all NPCs"
    )

    meta: Optional[Dict] = Field(default=None)


# ===================
# Behavior Profile Schemas (Phase 3)
# ===================


class ProfileConditionSchema(BaseModel):
    """
    Condition that must be met for a behavior profile to activate.

    Supports multiple condition types for flexible activation rules.
    """
    type: str = Field(description="Condition type (time_window, relationship_tier, flag, location, mood, etc.)")

    # Time-based conditions
    windows: Optional[List[str]] = Field(default=None, description="Time windows: morning, afternoon, evening, night")

    # Relationship conditions
    min_tier: Optional[str] = Field(default=None, description="Minimum relationship tier (stranger, acquaintance, friend, etc.)")
    max_tier: Optional[str] = Field(default=None, description="Maximum relationship tier")

    # Flag conditions
    flag: Optional[str] = Field(default=None, description="Flag name to check")
    flag_value: Optional[Any] = Field(default=None, description="Expected flag value (None = just check existence)")

    # Location conditions
    location_type: Optional[str] = Field(default=None, description="Location type (home, work, public, etc.)")
    location_tags: Optional[List[str]] = Field(default=None, description="Location must have these tags")

    # Mood conditions
    mood_tags: Optional[List[str]] = Field(default=None, description="Required mood tags")
    min_valence: Optional[float] = Field(default=None, ge=-100, le=100)
    max_valence: Optional[float] = Field(default=None, ge=-100, le=100)

    # Energy conditions
    min_energy: Optional[float] = Field(default=None, ge=0, le=100)
    max_energy: Optional[float] = Field(default=None, ge=0, le=100)

    # Custom expression (for advanced use)
    expression: Optional[str] = Field(default=None, description="Custom condition expression")


class ProfileModifiersSchema(BaseModel):
    """
    Modifiers applied when a behavior profile is active.

    These stack with archetype modifiers following the layering order.
    """
    # Activity weight multipliers
    activityWeights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Activity weight multipliers (e.g., {'reading': 1.5})"
    )

    # Category weight multipliers
    categoryWeights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Category weight multipliers (e.g., {'social': 0.5})"
    )

    # Tag effects (temporary tag assignments)
    tagEffects: Optional[Dict[str, float]] = Field(
        default=None,
        description="Temporary tag effect multipliers"
    )

    # Mood adjustments (applied during profile)
    moodAdjustments: Optional[Dict[str, float]] = Field(
        default=None,
        description="Mood axis adjustments (e.g., {'romantic': 20, 'relaxed': 10})"
    )

    # Decision interval modifier
    decisionIntervalMultiplier: Optional[float] = Field(
        default=None,
        ge=0.1,
        le=10.0,
        description="Multiplier for decision intervals"
    )

    # Energy/stat modifiers
    energyDrainMultiplier: Optional[float] = Field(
        default=None,
        ge=0.1,
        le=10.0,
        description="Multiplier for energy drain rate"
    )


class BehaviorProfileSchema(BaseModel):
    """
    Behavior profile definition.

    Profiles are contextual behavior modifications that activate when
    certain conditions are met. They stack with archetype modifiers.

    Example: A "romantic_evening" profile that activates during evening
    hours when with a lover, boosting intimate activities.
    """
    id: str = Field(description="Unique profile ID (e.g., 'plugin:romance:romantic_evening')")
    name: str = Field(description="Display name")
    description: Optional[str] = Field(default=None)

    # Activation conditions (ALL must be true for profile to activate)
    conditions: List[ProfileConditionSchema] = Field(
        default_factory=list,
        description="Conditions that must ALL be met for profile to activate"
    )

    # Modifiers applied when active
    modifiers: ProfileModifiersSchema = Field(
        default_factory=ProfileModifiersSchema,
        description="Behavior modifiers applied when profile is active"
    )

    # Priority (higher = applied later, can override lower priority profiles)
    priority: int = Field(
        default=100,
        ge=0,
        le=1000,
        description="Priority for layering (higher = applied later)"
    )

    # Exclusivity group (only one profile per group can be active)
    exclusivityGroup: Optional[str] = Field(
        default=None,
        description="Only one profile per group can be active (highest priority wins)"
    )

    # Plugin that owns this profile
    pluginId: Optional[str] = Field(default=None, description="Plugin ID (for namespacing)")

    # Metadata
    tags: Optional[List[str]] = Field(default=None, description="Tags for categorization")
    meta: Optional[Dict] = Field(default=None)

    @field_validator('id')
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Profile ID cannot be empty')
        return v.strip()


class EnergyThresholdsSchema(BaseModel):
    """Energy threshold configuration for urgency calculations."""
    lowEnergy: float = Field(default=30, ge=0, le=100)
    highEnergy: float = Field(default=80, ge=0, le=100)
    lowEnergyBoost: float = Field(default=2.0, ge=0.1, le=10.0)
    highEnergyBoost: float = Field(default=1.5, ge=0.1, le=10.0)


class MoodThresholdsSchema(BaseModel):
    """Mood threshold configuration for urgency calculations."""
    lowValence: float = Field(default=-30, ge=-100, le=100)
    lowValenceBoost: float = Field(default=1.5, ge=0.1, le=10.0)
    moodMatchBonus: float = Field(default=1.5, ge=0.1, le=10.0)
    moodMismatchPenalty: float = Field(default=0.5, ge=0.01, le=1.0)


class TagEffectSchema(BaseModel):
    """
    Custom tag effect definition.

    Tags are semantic labels (e.g., 'phobia', 'passion') that affect scoring.
    Each tag can have a custom multiplier instead of using built-in defaults.
    """
    multiplier: float = Field(ge=0.01, le=10.0, description="Scoring multiplier when tag matches")
    description: Optional[str] = None


class ArchetypeBehaviorModifiersSchema(BaseModel):
    """
    Behavior modifiers applied when an NPC has this archetype.

    These use multipliers (1.0 = no change) rather than raw values.
    Per-archetype tuning allows different personalities to have different
    sensitivities (e.g., nervous characters need more rest).
    """

    # Activity preferences: activity_id -> weight multiplier (0.5 = half, 2.0 = double)
    activityWeights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Activity weight multipliers (1.0 = neutral)"
    )

    # Category preferences: category_id -> weight multiplier
    categoryWeights: Optional[Dict[str, float]] = Field(
        default=None,
        description="Category weight multipliers (1.0 = neutral)"
    )

    # Decision timing
    decisionIntervalMultiplier: Optional[float] = Field(
        default=None,
        ge=0.1,
        le=10.0,
        description="Multiplier for decision intervals (>1 = slower decisions)"
    )

    # Social energy
    socialCooldownMultiplier: Optional[float] = Field(
        default=None,
        ge=0.1,
        le=10.0,
        description="Multiplier for social activity cooldowns"
    )

    # Activity avoidance (semantic tags, not raw scores)
    uncomfortableWith: Optional[List[str]] = Field(
        default=None,
        description="Activity/category tags this archetype avoids"
    )

    # Activity affinity (semantic tags)
    comfortableWith: Optional[List[str]] = Field(
        default=None,
        description="Activity/category tags this archetype prefers"
    )

    # ===================
    # Per-Archetype Tuning (Option B)
    # ===================

    # Custom tag effects: tag_name -> multiplier
    # Overrides built-in/plugin tag effects for this archetype
    tagEffects: Optional[Dict[str, TagEffectSchema]] = Field(
        default=None,
        description="Custom tag effect multipliers (e.g., {'phobia': {multiplier: 0.05}})"
    )

    # Energy sensitivity (different archetypes tire differently)
    energyThresholds: Optional[EnergyThresholdsSchema] = Field(
        default=None,
        description="Per-archetype energy thresholds for urgency"
    )

    # Mood sensitivity (different archetypes react to mood differently)
    moodThresholds: Optional[MoodThresholdsSchema] = Field(
        default=None,
        description="Per-archetype mood thresholds for scoring"
    )

    # Trait-category mappings (which traits affect which categories)
    traitCategoryMappings: Optional[Dict[str, str]] = Field(
        default=None,
        description="Category -> trait mappings (e.g., {'social': 'extraversion'})"
    )

    @field_validator('activityWeights', 'categoryWeights')
    @classmethod
    def validate_weight_multipliers(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        """Ensure weight multipliers are positive."""
        if v is not None:
            for key, weight in v.items():
                if weight < 0:
                    raise ValueError(f'Weight multiplier for "{key}" must be non-negative')
        return v


class PersonalityArchetypeSchema(BaseModel):
    """
    Semantic personality archetype definition.

    Archetypes define personality in semantic terms (shy, bold, etc.)
    rather than raw numeric values, making them more intuitive to author.
    """

    id: str = Field(description="Unique archetype ID (e.g., 'shy_bookworm')")
    name: str = Field(description="Display name")
    description: Optional[str] = Field(default=None, description="Human-readable description")

    # Semantic trait levels instead of 0-100 values
    traits: Dict[str, TraitLevel] = Field(
        default_factory=dict,
        description="Trait name -> semantic level mapping"
    )

    # Behavior modifications
    behaviorModifiers: Optional[ArchetypeBehaviorModifiersSchema] = Field(
        default=None,
        description="How this archetype modifies NPC behavior"
    )

    # Mood influences (semantic)
    baseMoodTendencies: Optional[Dict[str, TraitLevel]] = Field(
        default=None,
        description="Baseline mood tendencies (e.g., {'anxiety': 'high', 'cheerfulness': 'low'})"
    )

    # Tags for querying/filtering
    tags: Optional[List[str]] = Field(
        default=None,
        description="Tags for categorization (e.g., ['introvert', 'intellectual'])"
    )

    # Extension point
    meta: Optional[Dict] = Field(default=None, description="Additional metadata")

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure archetype ID is not empty."""
        if not v or not v.strip():
            raise ValueError('Archetype ID cannot be empty')
        return v.strip()

    @field_validator('traits')
    @classmethod
    def validate_traits(cls, v: Dict[str, TraitLevel]) -> Dict[str, TraitLevel]:
        """Validate trait levels are valid."""
        valid_levels = set(TRAIT_LEVEL_VALUES.keys())
        for trait_name, level in v.items():
            if level not in valid_levels:
                raise ValueError(
                    f'Invalid trait level "{level}" for trait "{trait_name}". '
                    f'Must be one of: {", ".join(valid_levels)}'
                )
        return v


class NpcPersonalitySchema(BaseModel):
    """
    NPC's personality configuration.

    References an archetype and allows individual variations.
    """

    archetypeId: Optional[str] = Field(
        default=None,
        description="ID of archetype to inherit from"
    )

    # Individual trait overrides (override archetype traits)
    traitOverrides: Optional[Dict[str, TraitLevel]] = Field(
        default=None,
        description="Per-NPC trait level overrides"
    )

    # Individual behavior modifier overrides
    behaviorOverrides: Optional[ArchetypeBehaviorModifiersSchema] = Field(
        default=None,
        description="Per-NPC behavior modifier overrides"
    )

    # Direct preference overrides (highest priority in merge chain)
    preferenceOverrides: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Direct preference overrides (activity weights, etc.)"
    )


class NpcConfigSchema(BaseModel):
    """
    World-level NPC configuration.

    Stored in GameWorld.meta.npc_config
    """

    version: int = Field(default=1, ge=1)

    # Personality archetypes defined for this world
    archetypes: Optional[Dict[str, PersonalityArchetypeSchema]] = Field(
        default=None,
        description="Available archetypes: id -> definition"
    )

    # Default archetype for NPCs without explicit personality
    defaultArchetypeId: Optional[str] = Field(
        default=None,
        description="Default archetype ID for NPCs without personality config"
    )

    # World-level trait definitions (what traits exist in this world)
    definedTraits: Optional[List[str]] = Field(
        default=None,
        description="List of trait names used in this world"
    )

    # Feature flags (can override global FEATURE_FLAGS)
    featureFlags: Optional[Dict[str, bool]] = Field(
        default=None,
        description="Per-world feature flag overrides"
    )

    meta: Optional[Dict] = Field(default=None)

    @model_validator(mode='after')
    def validate_default_archetype_exists(self):
        """Ensure defaultArchetypeId references a defined archetype."""
        if self.defaultArchetypeId and self.archetypes:
            if self.defaultArchetypeId not in self.archetypes:
                raise ValueError(
                    f'defaultArchetypeId "{self.defaultArchetypeId}" not found in archetypes'
                )
        return self


# ===================
# Helper Functions
# ===================


def get_trait_value(level: TraitLevel) -> float:
    """Convert semantic trait level to numeric value (0.2-1.0)."""
    return TRAIT_LEVEL_VALUES.get(level, 0.6)  # Default to medium


def get_archetype_activity_multiplier(
    archetype: Optional[PersonalityArchetypeSchema],
    activity_id: str,
    category: str
) -> float:
    """
    Get the activity weight multiplier from an archetype.

    Checks activity-specific weights first, then category weights.
    Returns 1.0 (neutral) if no modifier found.
    """
    if not archetype or not archetype.behaviorModifiers:
        return 1.0

    modifiers = archetype.behaviorModifiers

    # Check activity-specific weight first
    if modifiers.activityWeights and activity_id in modifiers.activityWeights:
        return modifiers.activityWeights[activity_id]

    # Check category weight
    if modifiers.categoryWeights and category in modifiers.categoryWeights:
        return modifiers.categoryWeights[category]

    # Check uncomfortable/comfortable tags
    if modifiers.uncomfortableWith:
        if activity_id in modifiers.uncomfortableWith or category in modifiers.uncomfortableWith:
            return 0.3  # Strong penalty

    if modifiers.comfortableWith:
        if activity_id in modifiers.comfortableWith or category in modifiers.comfortableWith:
            return 1.5  # Bonus

    return 1.0


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

    Weight Layering Order (for deterministic scoring):
    1. Base activity weights (from routine graph nodes)
    2. World defaults (scoringConfig.weights)
    3. Archetype modifiers (npcConfig.archetypes[id].behaviorModifiers)
    4. NPC overrides (npc.meta.personality.behaviorOverrides)
    5. Active behavior profiles (from plugins) [Phase 3]
    6. Transient mood/context modifiers [runtime]
    """

    version: int = Field(default=CURRENT_BEHAVIOR_VERSION, ge=1)

    # NPC personality configuration (Phase 1: Archetypes)
    npcConfig: Optional[NpcConfigSchema] = Field(
        default=None,
        description="World-level NPC personality archetypes and config"
    )

    # Trait effect mappings (Phase 4)
    traitEffects: Optional[TraitEffectConfigSchema] = Field(
        default=None,
        description="How personality traits influence behavior"
    )

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
