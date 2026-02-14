"""
Game Domain Schemas

Pydantic validation schemas for game configuration and state.

Split into focused modules:
- relationship: Relationship tiers, intimacy, mood, reputation schemas
- behavior: Activity, routine, condition, effect, scoring schemas
- components: ECS component schemas
- metrics: Metric definition schemas
- simulation: Game state, scheduler, turn, profile schemas
"""

# Relationship, intimacy, mood, reputation schemas
from .relationship import (
    detect_tier_overlaps,
    detect_tier_gaps,
    RelationshipTierSchema,
    IntimacyLevelSchema,
    IntimacySchema,
    GeneralMoodSchema,
    IntimateMoodSchema,
    MoodSchemaConfig,
    ReputationBandSchema,
    ReputationSchemaConfig,
    CURRENT_SCHEMA_VERSION,
    WorldMetaSchemas,
    auto_migrate_schema,
)

# Behavior, activity, routine schemas
from .behavior import (
    CURRENT_BEHAVIOR_VERSION,
    FEATURE_FLAGS,
    TRAIT_LEVEL_VALUES,
    TraitLevel,
    # Personality archetypes (Phase 1)
    ArchetypeBehaviorModifiersSchema,
    PersonalityArchetypeSchema,
    NpcPersonalitySchema,
    NpcConfigSchema,
    get_trait_value,
    get_archetype_activity_multiplier,
    # Core behavior schemas
    ConditionSchema,
    ActivityCategoryConfigSchema,
    RelationshipDeltaSchema,
    CustomEffectSchema,
    ActivityEffectsSchema,
    ActivityRequirementsSchema,
    ActivityVisualMetaSchema,
    ActivitySchema,
    NpcTraitModifiersSchema,
    NpcPreferencesSchema,
    PreferredActivitySchema,
    RoutineNodeSchema,
    RoutineEdgeSchema,
    RoutineGraphSchema,
    ScoringWeightsSchema,
    ScoringConfigSchema,
    SimulationTierSchema,
    SimulationPriorityRuleSchema,
    SimulationConfigSchema,
    CustomConditionEvaluatorSchema,
    CustomEffectHandlerSchema,
    NpcPreferencePresetSchema,
    BehaviorConfigSchema,
    auto_migrate_behavior_config,
)

# ECS component schemas
from .components import (
    RelationshipCoreComponentSchema,
    RomanceComponentSchema,
    StealthComponentSchema,
    MoodStateComponentSchema,
    QuestParticipationComponentSchema,
    BehaviorStateComponentSchema,
    InteractionStateComponentSchema,
    PluginComponentSchema,
    NpcEntityStateSchema,
)

# Metric schemas
from .metrics import (
    MetricDefinitionSchema,
    MetricRegistrySchema,
)

# Simulation configuration schemas
from .simulation import (
    GameStateSchema,
    WorldSchedulerTierConfigSchema,
    WorldSchedulerConfigSchema,
    TurnConfigSchema,
    GameProfileSchema,
    get_default_world_scheduler_config,
)

# Project bundle schemas
from .project_bundle import (
    PROJECT_BUNDLE_SCHEMA_VERSION,
    ProjectImportMode,
    BundleWorldData,
    BundleHotspotData,
    BundleLocationData,
    BundleNpcScheduleData,
    BundleNpcExpressionData,
    BundleNpcData,
    BundleSceneNodeData,
    BundleSceneEdgeData,
    BundleSceneData,
    BundleItemData,
    GameProjectCoreBundle,
    GameProjectBundle,
    GameProjectImportRequest,
    ProjectImportCounts,
    ProjectImportIdMaps,
    GameProjectImportResponse,
    SaveGameProjectRequest,
    SavedGameProjectSummary,
    SavedGameProjectDetail,
)

__all__ = [
    # Relationship schemas + helpers
    "detect_tier_overlaps",
    "detect_tier_gaps",
    "RelationshipTierSchema",
    "IntimacyLevelSchema",
    "IntimacySchema",
    "GeneralMoodSchema",
    "IntimateMoodSchema",
    "MoodSchemaConfig",
    "ReputationBandSchema",
    "ReputationSchemaConfig",
    "CURRENT_SCHEMA_VERSION",
    "WorldMetaSchemas",
    "auto_migrate_schema",

    # Behavior schemas
    "CURRENT_BEHAVIOR_VERSION",
    "FEATURE_FLAGS",
    "TRAIT_LEVEL_VALUES",
    "TraitLevel",
    # Personality archetypes
    "ArchetypeBehaviorModifiersSchema",
    "PersonalityArchetypeSchema",
    "NpcPersonalitySchema",
    "NpcConfigSchema",
    "get_trait_value",
    "get_archetype_activity_multiplier",
    # Core behavior
    "ConditionSchema",
    "ActivityCategoryConfigSchema",
    "RelationshipDeltaSchema",
    "CustomEffectSchema",
    "ActivityEffectsSchema",
    "ActivityRequirementsSchema",
    "ActivityVisualMetaSchema",
    "ActivitySchema",
    "NpcTraitModifiersSchema",
    "NpcPreferencesSchema",
    "PreferredActivitySchema",
    "RoutineNodeSchema",
    "RoutineEdgeSchema",
    "RoutineGraphSchema",
    "ScoringWeightsSchema",
    "ScoringConfigSchema",
    "SimulationTierSchema",
    "SimulationPriorityRuleSchema",
    "SimulationConfigSchema",
    "CustomConditionEvaluatorSchema",
    "CustomEffectHandlerSchema",
    "NpcPreferencePresetSchema",
    "BehaviorConfigSchema",
    "auto_migrate_behavior_config",

    # Component schemas
    "RelationshipCoreComponentSchema",
    "RomanceComponentSchema",
    "StealthComponentSchema",
    "MoodStateComponentSchema",
    "QuestParticipationComponentSchema",
    "BehaviorStateComponentSchema",
    "InteractionStateComponentSchema",
    "PluginComponentSchema",
    "NpcEntityStateSchema",

    # Metric schemas
    "MetricDefinitionSchema",
    "MetricRegistrySchema",

    # Simulation schemas
    "GameStateSchema",
    "WorldSchedulerTierConfigSchema",
    "WorldSchedulerConfigSchema",
    "TurnConfigSchema",
    "GameProfileSchema",
    "get_default_world_scheduler_config",

    # Project bundle schemas
    "PROJECT_BUNDLE_SCHEMA_VERSION",
    "ProjectImportMode",
    "BundleWorldData",
    "BundleHotspotData",
    "BundleLocationData",
    "BundleNpcScheduleData",
    "BundleNpcExpressionData",
    "BundleNpcData",
    "BundleSceneNodeData",
    "BundleSceneEdgeData",
    "BundleSceneData",
    "BundleItemData",
    "GameProjectCoreBundle",
    "GameProjectBundle",
    "GameProjectImportRequest",
    "ProjectImportCounts",
    "ProjectImportIdMaps",
    "GameProjectImportResponse",
    "SaveGameProjectRequest",
    "SavedGameProjectSummary",
    "SavedGameProjectDetail",
]
