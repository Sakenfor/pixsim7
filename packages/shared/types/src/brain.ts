/**
 * Brain state types for NPC cognitive modeling.
 *
 * Provides generic, data-driven brain state that adapts to whatever
 * stat packages a world uses. No hardcoded stat names or structures.
 */

import type { IDs } from './index';

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
  npcId: IDs.NpcId;
  worldId: IDs.WorldId;

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

/**
 * A single behavior urge entry with its key and value.
 */
export interface BehaviorUrge {
  /** The behavior key (e.g., "rest", "socialize", "explore") */
  key: string;
  /** The urgency value (0-100) */
  value: number;
}
