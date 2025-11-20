/**
 * GameProfile utility functions for Task 23
 *
 * Provides helpers to derive behavior defaults, simulation config,
 * and interaction tuning from a world's GameProfile.
 */

import type {
  GameProfile,
  BehaviorProfile,
  NarrativeProfile,
  GameStyle,
  CoreGameStyle,
  ScoringConfig,
  SimulationConfig,
} from '@pixsim7/types';

/**
 * Built-in behavior profile definitions
 *
 * These are the default behavior profiles that can be extended or overridden
 * by world metadata (meta.behavior.behaviorProfiles).
 *
 * Following the "dogfooding" principle: if plugins can define profiles,
 * built-ins should use the same data structure.
 */
const BUILTIN_BEHAVIOR_PROFILES: Record<BehaviorProfile, ScoringConfig['weights']> = {
  balanced: {
    baseWeight: 1.0,
    activityPreference: 1.0,
    categoryPreference: 0.8,
    traitModifier: 0.6,
    moodCompatibility: 0.7,
    relationshipBonus: 0.5,
    urgency: 1.2,
    inertia: 0.3,
  },
  work_focused: {
    baseWeight: 1.0,
    activityPreference: 1.0,
    categoryPreference: 1.0, // Stronger preference for assigned work categories
    traitModifier: 0.6,
    moodCompatibility: 0.5, // Mood less important for work
    relationshipBonus: 0.3, // Lower relationship influence
    urgency: 1.5, // Higher urgency (low energy → boost rest more aggressively)
    inertia: 0.3,
  },
  relationship_focused: {
    baseWeight: 1.0,
    activityPreference: 1.0,
    categoryPreference: 0.6, // Less strict about work categories
    traitModifier: 0.6,
    moodCompatibility: 0.9, // Mood very important
    relationshipBonus: 0.9, // High relationship influence
    urgency: 0.8, // Lower urgency
    inertia: 0.3,
  },
};

/**
 * Get default scoring weights based on behavior profile
 *
 * Supports custom behavior profiles defined in world metadata.
 * Falls back to built-in profiles if not found.
 *
 * @param behaviorProfile - The behavior profile to look up
 * @param worldMeta - Optional world metadata that may contain custom profiles
 * @returns Scoring weights for the profile
 */
export function getDefaultScoringWeights(
  behaviorProfile: BehaviorProfile,
  worldMeta?: { behavior?: { behaviorProfiles?: Record<string, ScoringConfig['weights']> } }
): ScoringConfig['weights'] {
  // First, try to find custom profile in world metadata
  if (worldMeta?.behavior?.behaviorProfiles) {
    const customProfile = worldMeta.behavior.behaviorProfiles[behaviorProfile];
    if (customProfile) {
      return customProfile;
    }
  }

  // Fall back to built-in profiles
  const builtinProfile = BUILTIN_BEHAVIOR_PROFILES[behaviorProfile];
  if (builtinProfile) {
    return builtinProfile;
  }

  // Ultimate fallback: return balanced profile
  return BUILTIN_BEHAVIOR_PROFILES.balanced;
}

/**
 * Default simulation tier limits per game style
 *
 * These defaults can be overridden per-world via world.meta.simulationConfig.tierLimits
 * Only built-in core styles are defined here; custom styles fall back to 'hybrid'.
 */
const STYLE_DEFAULT_TIER_LIMITS: Record<CoreGameStyle, {
  detailed: number;
  active: number;
  ambient: number;
  dormant: number;
}> = {
  life_sim: {
    detailed: 10, // Immediate NPCs (player's location)
    active: 150, // Many NPCs actively simulated
    ambient: 800, // Large ambient population
    dormant: 10000, // Huge dormant pool
  },
  visual_novel: {
    detailed: 20, // More detailed simulation for key NPCs
    active: 50, // Fewer NPCs, but more detailed
    ambient: 200, // Smaller ambient population
    dormant: 2000, // Smaller dormant pool
  },
  hybrid: {
    detailed: 15,
    active: 100,
    ambient: 500,
    dormant: 5000,
  },
};

/**
 * Get simulation tier limits based on game style
 *
 * Checks world metadata first for custom tier limits, then falls back to style defaults.
 *
 * For life_sim worlds:
 * - More NPCs at 'active' tier; frequent updates
 *
 * For visual_novel worlds:
 * - Fewer NPCs at 'detailed' tier; focus on narrative-relevant NPCs
 *
 * @param style - The game style
 * @param worldMeta - Optional world metadata that may contain custom tier limits
 * @returns Simulation tier limits
 */
export function getDefaultSimulationTierLimits(
  style: GameStyle,
  worldMeta?: { simulationConfig?: { tierLimits?: Record<string, number> } }
): {
  detailed: number;
  active: number;
  ambient: number;
  dormant: number;
} {
  // First, check for world-specific tier limit overrides
  if (worldMeta?.simulationConfig?.tierLimits) {
    const overrides = worldMeta.simulationConfig.tierLimits;

    // Merge overrides with defaults for this style
    // For custom styles, fall back to 'hybrid' defaults
    const styleKey = (style in STYLE_DEFAULT_TIER_LIMITS ? style : 'hybrid') as CoreGameStyle;
    const styleDefaults = STYLE_DEFAULT_TIER_LIMITS[styleKey];

    return {
      detailed: overrides.detailed ?? styleDefaults.detailed,
      active: overrides.active ?? styleDefaults.active,
      ambient: overrides.ambient ?? styleDefaults.ambient,
      dormant: overrides.dormant ?? styleDefaults.dormant,
    };
  }

  // Fall back to style defaults (or 'hybrid' for custom styles)
  const styleKey = (style in STYLE_DEFAULT_TIER_LIMITS ? style : 'hybrid') as CoreGameStyle;
  return STYLE_DEFAULT_TIER_LIMITS[styleKey];
}

/**
 * Merge explicit behavior config with defaults from GameProfile
 *
 * If world has explicit behavior.scoringConfig, use that.
 * Otherwise, derive defaults from behaviorProfile.
 *
 * Supports custom behavior profiles defined in world metadata.
 *
 * @param gameProfile - The game profile
 * @param explicitScoringConfig - Explicit scoring config to use
 * @param worldMeta - Optional world metadata that may contain custom behavior profiles
 */
export function getBehaviorScoringConfig(
  gameProfile: GameProfile | undefined,
  explicitScoringConfig?: ScoringConfig,
  worldMeta?: { behavior?: { behaviorProfiles?: Record<string, ScoringConfig['weights']> } }
): ScoringConfig {
  // If explicit config exists, use it
  if (explicitScoringConfig) {
    return explicitScoringConfig;
  }

  // Otherwise, derive from behaviorProfile (with custom profiles support)
  const behaviorProfile = gameProfile?.behaviorProfile ?? 'balanced';
  const weights = getDefaultScoringWeights(behaviorProfile, worldMeta);

  return {
    version: 1,
    weights,
    meta: {
      derivedFrom: `gameProfile.behaviorProfile=${behaviorProfile}`,
      customProfileUsed: worldMeta?.behavior?.behaviorProfiles?.[behaviorProfile] !== undefined,
    },
  };
}

/**
 * Merge explicit simulation config with defaults from GameProfile
 *
 * Adjusts simulation tier limits based on game style if no explicit config.
 * Supports custom tier limits defined in world metadata.
 *
 * @param gameProfile - The game profile
 * @param explicitSimulationConfig - Explicit simulation config to use
 * @param worldMeta - Optional world metadata that may contain custom tier limits
 */
export function getSimulationConfig(
  gameProfile: GameProfile | undefined,
  explicitSimulationConfig?: SimulationConfig,
  worldMeta?: { simulationConfig?: { tierLimits?: Record<string, number> } }
): SimulationConfig | undefined {
  // If explicit config exists, use it
  if (explicitSimulationConfig) {
    return explicitSimulationConfig;
  }

  // If no gameProfile, return undefined (use system defaults)
  if (!gameProfile) {
    return undefined;
  }

  // Derive tier limits from game style (with world metadata overrides)
  const tierLimits = getDefaultSimulationTierLimits(gameProfile.style, worldMeta);

  // Create default simulation config based on style
  return {
    version: 1,
    tiers: [
      {
        id: 'detailed',
        tickFrequencySeconds: 1.0,
        detailLevel: 'full',
        meta: { maxNpcs: tierLimits.detailed },
      },
      {
        id: 'active',
        tickFrequencySeconds: 5.0,
        detailLevel: 'full',
        meta: { maxNpcs: tierLimits.active },
      },
      {
        id: 'ambient',
        tickFrequencySeconds: 30.0,
        detailLevel: 'simplified',
        meta: { maxNpcs: tierLimits.ambient },
      },
      {
        id: 'dormant',
        tickFrequencySeconds: 300.0,
        detailLevel: 'schedule_only',
        meta: { maxNpcs: tierLimits.dormant },
      },
    ],
    priorityRules: [
      // NPCs in same location as player → detailed tier
      {
        condition: { type: 'custom', evaluatorId: 'evaluator:same_location_as_player', params: {} },
        tier: 'detailed',
        priority: 100,
      },
      // NPCs with high relationship → active tier
      {
        condition: { type: 'relationship_gt', npcIdOrRole: 'player', metric: 'affinity', threshold: 60 },
        tier: 'active',
        priority: 80,
      },
      // Default to ambient
      {
        condition: { type: 'custom', evaluatorId: 'evaluator:always_true', params: {} },
        tier: 'ambient',
        priority: 0,
      },
    ],
    defaultTier: 'ambient',
    meta: {
      derivedFrom: `gameProfile.style=${gameProfile.style}`,
      customTierLimitsUsed: worldMeta?.simulationConfig?.tierLimits !== undefined,
    },
  };
}

/**
 * Get narrative emphasis weight based on narrative profile
 *
 * Returns a 0-1 weight indicating how much to favor narrative programs
 * over free-play interactions.
 */
export function getNarrativeEmphasisWeight(profile: NarrativeProfile): number {
  switch (profile) {
    case 'light':
      return 0.2; // Minimal narrative emphasis
    case 'moderate':
      return 0.5; // Balanced
    case 'heavy':
      return 0.9; // Strong narrative emphasis
    default:
      return 0.5;
  }
}

/**
 * Check if a GameProfile is valid and complete
 */
export function isValidGameProfile(profile: unknown): profile is GameProfile {
  if (!profile || typeof profile !== 'object') {
    return false;
  }

  const p = profile as Partial<GameProfile>;

  // Required fields
  if (!p.style || !p.simulationMode) {
    return false;
  }

  // Validate style
  const validStyles: GameStyle[] = ['life_sim', 'visual_novel', 'hybrid'];
  if (!validStyles.includes(p.style)) {
    return false;
  }

  // Validate simulationMode
  const validModes = ['real_time', 'turn_based', 'paused'];
  if (!validModes.includes(p.simulationMode)) {
    return false;
  }

  // If turn_based, turnConfig is required
  if (p.simulationMode === 'turn_based' && !p.turnConfig) {
    return false;
  }

  return true;
}

/**
 * Get default GameProfile when none is specified
 */
export function getDefaultGameProfile(): GameProfile {
  return {
    style: 'hybrid',
    simulationMode: 'real_time',
    behaviorProfile: 'balanced',
    narrativeProfile: 'moderate',
  };
}

/**
 * Get recommended interaction defaults based on game style
 *
 * Returns guidance for what types of interactions to emphasize
 * for a given game style.
 */
export function getInteractionDefaults(style: GameStyle): {
  emphasizeSurfaces: string[];
  emphasizeTypes: string[];
  defaultDuration: 'short' | 'medium' | 'long';
  narrativeDensity: 'sparse' | 'moderate' | 'dense';
} {
  switch (style) {
    case 'life_sim':
      return {
        emphasizeSurfaces: ['inline', 'ambient'],
        emphasizeTypes: ['talk', 'casual', 'daily_routine'],
        defaultDuration: 'short',
        narrativeDensity: 'sparse',
      };

    case 'visual_novel':
      return {
        emphasizeSurfaces: ['dialogue', 'scene'],
        emphasizeTypes: ['story', 'choice', 'relationship'],
        defaultDuration: 'long',
        narrativeDensity: 'dense',
      };

    case 'hybrid':
    default:
      return {
        emphasizeSurfaces: ['inline', 'dialogue', 'ambient'],
        emphasizeTypes: ['talk', 'story', 'relationship', 'casual'],
        defaultDuration: 'medium',
        narrativeDensity: 'moderate',
      };
  }
}

/**
 * Determine whether to launch a narrative program vs simple interaction
 *
 * Returns a boolean recommendation based on GameProfile and context.
 * Use this in interaction/narrative flow decision points.
 *
 * @param profile - The game profile
 * @param context - Additional context for the decision
 * @returns true if a narrative program should be favored, false for simple interaction
 */
export function shouldFavorNarrativeProgram(
  profile: GameProfile | undefined,
  context: {
    interactionType?: string;
    relationshipTier?: string;
    isStoryBeat?: boolean;
  } = {}
): boolean {
  if (!profile) {
    return false; // Default to simple interaction
  }

  const narrativeWeight = getNarrativeEmphasisWeight(profile.narrativeProfile ?? 'moderate');

  // Heavy narrative: always favor narrative programs
  if (narrativeWeight >= 0.9) {
    return true;
  }

  // Light narrative: only for major story beats
  if (narrativeWeight <= 0.2) {
    return context.isStoryBeat ?? false;
  }

  // Moderate narrative: favor for story interactions and high relationship tiers
  const isStoryInteraction =
    context.interactionType === 'story' ||
    context.interactionType === 'choice' ||
    context.isStoryBeat;

  const isHighRelationship =
    context.relationshipTier === 'close_friend' ||
    context.relationshipTier === 'lover';

  return isStoryInteraction || isHighRelationship;
}

/**
 * Get recommended narrative program frequency
 *
 * Returns how often narrative programs should trigger based on profile.
 */
export function getNarrativeFrequency(profile: GameProfile | undefined): {
  programsPerHour: number;
  minTimeBetweenPrograms: number; // in game seconds
  description: string;
} {
  const narrativeProfile = profile?.narrativeProfile ?? 'moderate';

  switch (narrativeProfile) {
    case 'light':
      return {
        programsPerHour: 0.5, // 1 every 2 hours
        minTimeBetweenPrograms: 7200, // 2 hours
        description: 'Sparse narrative programs for major events only',
      };

    case 'moderate':
      return {
        programsPerHour: 1, // 1 per hour
        minTimeBetweenPrograms: 3600, // 1 hour
        description: 'Balanced narrative and free play',
      };

    case 'heavy':
      return {
        programsPerHour: 3, // 3 per hour
        minTimeBetweenPrograms: 1200, // 20 minutes
        description: 'Frequent narrative programs and branching sequences',
      };

    default:
      return {
        programsPerHour: 1,
        minTimeBetweenPrograms: 3600,
        description: 'Default narrative frequency',
      };
  }
}
