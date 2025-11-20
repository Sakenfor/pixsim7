"""
Game Domain Schemas - Compatibility Layer

This module re-exports all schemas from the schemas/ package for backward compatibility.
New code should import from the specific modules in schemas/ package.

Deprecated location - import from schemas/ submodules instead:
- schemas.relationship: Relationship, intimacy, mood, reputation schemas
- schemas.behavior: Activity, routine, condition, effect schemas
- schemas.components: ECS component schemas
- schemas.metrics: Metric definition schemas
- schemas.simulation: Game state, scheduler, turn, profile schemas
"""

# Re-export everything from the schemas package for backward compatibility
from .schemas import *  # noqa: F401, F403

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
]
