/**
 * Brain state types for NPC cognitive modeling.
 *
 * Provides generic, data-driven brain state that adapts to whatever
 * stat packages a world uses. No hardcoded stat names or structures.
 */

/**
 * Snapshot of a single stat definition for one NPC.
 *
 * Contains current axis values plus computed tiers and levels.
 */
export interface BrainStatSnapshot {
  /** Current axis values (e.g., { valence: 70, arousal: 30 }) */
  axes: Record<string, number>;
  /** Computed tier per axis (e.g., { valence: "high", arousal: "low" }) */
  tiers: Record<string, string>;
  /** Highest priority matching level */
  levelId?: string;
  /** All matching levels (sorted by priority) */
  levelIds?: string[];
}

/**
 * Generic NPC brain state.
 *
 * Fully data-driven - structure depends on world's stat config.
 * Access stats via brain.stats[statDefId] and derived values via brain.derived[key].
 */
export interface BrainState {
  npcId: number;
  worldId: number;

  /** Stat snapshots keyed by definition ID */
  stats: Record<string, BrainStatSnapshot>;

  /** Derived values from derivation plugins */
  derived: Record<string, unknown>;

  /** Timestamp when brain was computed */
  computedAt: number;

  /** Which stat packages contributed to this brain state */
  sourcePackages: string[];
}

// ===================
// Derived Value Types
// ===================

/**
 * Derived mood structure (from mood_from_relationships plugin)
 */
export interface DerivedMood {
  valence: number;
  arousal: number;
  label: string;
  source?: string;
}

/**
 * Derived behavior urgency scores (from behavior_urgency plugin)
 */
export interface DerivedBehaviorUrgency {
  rest?: number;
  eat?: number;
  relax?: number;
  socialize?: number;
  explore?: number;
  achieve?: number;
  mood_boost?: number;
  [key: string]: number | undefined;
}

/**
 * Brain memory entry.
 *
 * Represents a single episodic memory for an NPC.
 * Memories are typically sourced from session flags or events.
 */
export interface BrainMemory {
  /** Unique memory ID */
  id: string;
  /** ISO timestamp when memory was created */
  timestamp: string;
  /** Human-readable summary of the memory */
  summary: string;
  /** Tags for categorization/filtering */
  tags: string[];
  /** Source of the memory */
  source?: 'scene' | 'event' | 'flag' | string;
}

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
