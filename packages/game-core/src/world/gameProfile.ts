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
  ScoringConfig,
  SimulationConfig,
} from '@pixsim7/types';

/**
 * Get default scoring weights based on behavior profile
 *
 * Maps behaviorProfile to default scoring weights as per Task 13 safeguards.
 * - work_focused: higher categoryPreference for work, higher urgency, conservative relationship weights
 * - relationship_focused: higher relationshipBonus, moodCompatibility, lower work emphasis
 * - balanced: middle-of-the-road defaults
 */
export function getDefaultScoringWeights(
  behaviorProfile: BehaviorProfile
): ScoringConfig['weights'] {
  const baseWeights = {
    baseWeight: 1.0,
    activityPreference: 1.0,
    categoryPreference: 0.8,
    traitModifier: 0.6,
    moodCompatibility: 0.7,
    relationshipBonus: 0.5,
    urgency: 1.2,
    inertia: 0.3,
  };

  switch (behaviorProfile) {
    case 'work_focused':
      return {
        ...baseWeights,
        categoryPreference: 1.0, // Stronger preference for assigned work categories
        urgency: 1.5, // Higher urgency (low energy → boost rest more aggressively)
        relationshipBonus: 0.3, // Lower relationship influence
        moodCompatibility: 0.5, // Mood less important for work
      };

    case 'relationship_focused':
      return {
        ...baseWeights,
        categoryPreference: 0.6, // Less strict about work categories
        urgency: 0.8, // Lower urgency
        relationshipBonus: 0.9, // High relationship influence
        moodCompatibility: 0.9, // Mood very important
      };

    case 'balanced':
    default:
      return baseWeights;
  }
}

/**
 * Get default simulation tier priorities based on game style
 *
 * For life_sim worlds:
 * - More NPCs at 'active' tier; frequent updates
 *
 * For visual_novel worlds:
 * - Fewer NPCs at 'detailed' tier; focus on narrative-relevant NPCs
 */
export function getDefaultSimulationTierLimits(style: GameStyle): {
  detailed: number;
  active: number;
  ambient: number;
  dormant: number;
} {
  switch (style) {
    case 'life_sim':
      // Life-sim: More NPCs in active simulation for world liveliness
      return {
        detailed: 10, // Immediate NPCs (player's location)
        active: 150, // Many NPCs actively simulated
        ambient: 800, // Large ambient population
        dormant: 10000, // Huge dormant pool
      };

    case 'visual_novel':
      // Visual novel: Focus on fewer, key NPCs
      return {
        detailed: 20, // More detailed simulation for key NPCs
        active: 50, // Fewer NPCs, but more detailed
        ambient: 200, // Smaller ambient population
        dormant: 2000, // Smaller dormant pool
      };

    case 'hybrid':
    default:
      // Hybrid: Balanced approach
      return {
        detailed: 15,
        active: 100,
        ambient: 500,
        dormant: 5000,
      };
  }
}

/**
 * Merge explicit behavior config with defaults from GameProfile
 *
 * If world has explicit behavior.scoringConfig, use that.
 * Otherwise, derive defaults from behaviorProfile.
 */
export function getBehaviorScoringConfig(
  gameProfile: GameProfile | undefined,
  explicitScoringConfig?: ScoringConfig
): ScoringConfig {
  // If explicit config exists, use it
  if (explicitScoringConfig) {
    return explicitScoringConfig;
  }

  // Otherwise, derive from behaviorProfile
  const behaviorProfile = gameProfile?.behaviorProfile ?? 'balanced';
  const weights = getDefaultScoringWeights(behaviorProfile);

  return {
    version: 1,
    weights,
    meta: {
      derivedFrom: `gameProfile.behaviorProfile=${behaviorProfile}`,
    },
  };
}

/**
 * Merge explicit simulation config with defaults from GameProfile
 *
 * Adjusts simulation tier limits based on game style if no explicit config.
 */
export function getSimulationConfig(
  gameProfile: GameProfile | undefined,
  explicitSimulationConfig?: SimulationConfig
): SimulationConfig | undefined {
  // If explicit config exists, use it
  if (explicitSimulationConfig) {
    return explicitSimulationConfig;
  }

  // If no gameProfile, return undefined (use system defaults)
  if (!gameProfile) {
    return undefined;
  }

  // Derive tier limits from game style
  const tierLimits = getDefaultSimulationTierLimits(gameProfile.style);

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
