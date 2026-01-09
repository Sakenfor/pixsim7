/**
 * Brain State Helpers
 *
 * Runtime logic for accessing and querying NPC brain state.
 * Types are imported from @pixsim7/shared.types.
 */
import type {
  BrainState,
  BrainStatSnapshot,
  DerivedMood,
  DerivedBehaviorUrgency,
  BehaviorUrge,
  BrainMemory,
} from '@pixsim7/shared.types';

// ===================
// Helper Functions
// ===================

/**
 * Safely get a stat snapshot from brain state.
 *
 * @example
 * const mood = getBrainStat(brain, "mood");
 * if (mood) {
 *   console.log(mood.axes.valence, mood.levelId);
 * }
 */
export function getBrainStat(
  brain: BrainState,
  statDefId: string
): BrainStatSnapshot | undefined {
  return brain.stats[statDefId];
}

/**
 * Check if brain has a specific stat package.
 *
 * @example
 * if (hasStat(brain, "personality")) {
 *   // Access personality stats
 * }
 */
export function hasStat(brain: BrainState, statDefId: string): boolean {
  return statDefId in brain.stats;
}

/**
 * Check if brain has a specific derived value.
 *
 * @example
 * if (hasDerived(brain, "mood")) {
 *   const mood = getMood(brain);
 * }
 */
export function hasDerived(brain: BrainState, key: string): boolean {
  return key in brain.derived;
}

/**
 * Get a derived value with type casting and fallback.
 *
 * @example
 * const style = getDerived(brain, "conversation_style", "neutral");
 * const urgency = getDerived<DerivedBehaviorUrgency>(brain, "behavior_urgency", {});
 */
export function getDerived<T>(brain: BrainState, key: string, fallback: T): T {
  return (brain.derived[key] as T) ?? fallback;
}

/**
 * Get derived mood from brain state.
 *
 * Checks both explicit mood stats and derived mood.
 *
 * @example
 * const mood = getMood(brain);
 * if (mood) {
 *   console.log(`Feeling ${mood.label} (valence: ${mood.valence})`);
 * }
 */
export function getMood(brain: BrainState): DerivedMood | undefined {
  // Try derived mood first (from derivation plugin)
  const derived = brain.derived['mood'] as DerivedMood | undefined;
  if (derived) {
    return derived;
  }

  // Try explicit mood stats
  const moodStats = brain.stats['mood'];
  if (moodStats) {
    return {
      valence: moodStats.axes.valence ?? 50,
      arousal: moodStats.axes.arousal ?? 50,
      label: moodStats.levelId ?? 'neutral',
      source: 'stats',
    };
  }

  return undefined;
}

/**
 * Get behavior urgency scores from brain state.
 *
 * Returns a DerivedBehaviorUrgency object with 0-100 values per behavior key.
 * Values represent how strongly the NPC is inclined toward that behavior.
 *
 * @example
 * const urgency = getBehaviorUrgency(brain);
 * if (urgency.rest && urgency.rest > 70) {
 *   // NPC really needs to rest
 * }
 */
export function getBehaviorUrgency(
  brain: BrainState
): DerivedBehaviorUrgency {
  return getDerived<DerivedBehaviorUrgency>(brain, 'behavior_urgency', {});
}

/**
 * Get the top N behavior urges from brain state, sorted by urgency.
 *
 * This is a convenience helper for displaying the most pressing needs.
 *
 * @param brain - The brain state to analyze
 * @param n - Maximum number of urges to return (default: 2)
 * @returns Array of behavior urges sorted by value (highest first)
 *
 * @example
 * const topUrges = getTopBehaviorUrges(brain, 2);
 * // Returns: [{ key: "socialize", value: 82 }, { key: "explore", value: 68 }]
 */
export function getTopBehaviorUrges(
  brain: BrainState,
  n: number = 2
): BehaviorUrge[] {
  const urgency = getBehaviorUrgency(brain);

  // Convert to array of {key, value} entries, filtering out undefined values
  const entries: BehaviorUrge[] = Object.entries(urgency)
    .filter(([_, value]) => value !== undefined && value > 0)
    .map(([key, value]) => ({ key, value: value as number }));

  // Sort by value descending and take top N
  return entries
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/**
 * Check if brain has any behavior urgency data.
 *
 * @example
 * if (hasBehaviorUrgency(brain)) {
 *   const urgency = getBehaviorUrgency(brain);
 * }
 */
export function hasBehaviorUrgency(brain: BrainState): boolean {
  const urgency = getBehaviorUrgency(brain);
  return Object.keys(urgency).length > 0;
}

/**
 * Get conversation style from brain state.
 *
 * @example
 * const style = getConversationStyle(brain);
 * // Returns: "enthusiastic", "warm", "reserved", "neutral", etc.
 */
export function getConversationStyle(brain: BrainState): string {
  return getDerived<string>(brain, 'conversation_style', 'neutral');
}

/**
 * Get a specific axis value from a stat definition.
 *
 * @example
 * const extraversion = getAxisValue(brain, "personality", "extraversion", 50);
 * const affinity = getAxisValue(brain, "relationships", "affinity", 0);
 */
export function getAxisValue(
  brain: BrainState,
  statDefId: string,
  axisName: string,
  fallback: number
): number {
  const snapshot = brain.stats[statDefId];
  if (!snapshot) return fallback;
  return snapshot.axes[axisName] ?? fallback;
}

/**
 * Get the tier for a specific axis.
 *
 * @example
 * const energyTier = getAxisTier(brain, "resources", "energy");
 * // Returns: "critical", "low", "moderate", "good", "excellent", or undefined
 */
export function getAxisTier(
  brain: BrainState,
  statDefId: string,
  axisName: string
): string | undefined {
  const snapshot = brain.stats[statDefId];
  if (!snapshot) return undefined;
  return snapshot.tiers[axisName];
}

/**
 * Check if an NPC is in a critical state based on resource levels.
 *
 * @example
 * if (isInCriticalState(brain)) {
 *   // Show warning, trigger help behavior, etc.
 * }
 */
export function isInCriticalState(brain: BrainState): boolean {
  const resources = brain.stats['resources'];
  if (!resources) return false;

  const criticalTiers = ['critical'];
  return Object.values(resources.tiers).some((tier) =>
    criticalTiers.includes(tier)
  );
}

// ==========================
// High-Level Derived Helpers
// ==========================

/**
 * Get NPC logic strategies from brain state.
 *
 * Logic strategies represent decision-making tendencies derived from
 * personality traits and other factors.
 *
 * @example
 * const strategies = getLogicStrategies(brain);
 * // Returns: ["cautious", "analytical"] or []
 */
export function getLogicStrategies(brain: BrainState): string[] {
  return getDerived<string[]>(brain, 'logic_strategies', []);
}

/**
 * Get NPC instincts from brain state.
 *
 * Instincts represent base drives and archetypes derived from
 * personality and resource states.
 *
 * @example
 * const instincts = getInstincts(brain);
 * // Returns: ["survive", "socialize", "explore"] or []
 */
export function getInstincts(brain: BrainState): string[] {
  return getDerived<string[]>(brain, 'instincts', []);
}

/**
 * Get NPC memories from brain state.
 *
 * Memories represent recent episodic history from session flags,
 * events, or scenes.
 *
 * @example
 * const memories = getMemories(brain);
 * for (const memory of memories) {
 *   console.log(`${memory.timestamp}: ${memory.summary}`);
 * }
 */
export function getMemories(brain: BrainState): BrainMemory[] {
  return getDerived<BrainMemory[]>(brain, 'memories', []);
}

/**
 * Get NPC persona tags from brain state.
 *
 * Persona tags are descriptive labels derived from personality traits
 * (e.g., "curious", "friendly", "optimistic").
 *
 * @example
 * const tags = getPersonaTags(brain);
 * // Returns: ["curious", "friendly"] or []
 */
export function getPersonaTags(brain: BrainState): string[] {
  return getDerived<string[]>(brain, 'persona_tags', []);
}

/**
 * Get NPC intimacy level from brain state.
 *
 * Intimacy level represents the romantic/intimate stage of a relationship.
 *
 * @example
 * const intimacy = getIntimacyLevel(brain);
 * // Returns: "light_flirt", "dating", etc. or null
 */
export function getIntimacyLevel(brain: BrainState): string | null {
  return getDerived<string | null>(brain, 'intimacy_level', null);
}

/**
 * Get NPC relationship flags from brain state.
 *
 * Relationship flags are event markers that track significant
 * relationship milestones (e.g., "first_meeting", "helped_with_task").
 *
 * @example
 * const flags = getRelationshipFlags(brain);
 * // Returns: ["first_meeting", "helped_with_task"] or []
 */
export function getRelationshipFlags(brain: BrainState): string[] {
  return getDerived<string[]>(brain, 'relationship_flags', []);
}
