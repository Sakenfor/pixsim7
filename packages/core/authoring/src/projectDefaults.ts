/**
 * Project Defaults & Presets
 *
 * Provides starter configurations for new projects (worlds) based on
 * the chosen game style. These are pure data — no side effects.
 *
 * The engine's `gameProfile.ts` handles runtime behavior/scoring defaults.
 * This module handles *authoring* defaults: what content to scaffold,
 * what config shape to initialize, what the "new project" experience looks like.
 */

import type {
  GameProfile,
  CoreGameStyle,
  WorldManifest,
} from '@pixsim7/shared.types';

// ---------------------------------------------------------------------------
// Project preset
// ---------------------------------------------------------------------------

/** A named preset that configures a new project for a specific game style. */
export interface ProjectPreset {
  /** Machine-readable id */
  id: string;
  /** Display label */
  label: string;
  /** Short description for selection UI */
  description: string;
  /** The game profile to store in world.meta.gameProfile */
  gameProfile: GameProfile;
  /** Initial world manifest */
  manifest: WorldManifest;
  /** Starter content scaffold hints */
  scaffold: ProjectScaffold;
}

/** Hints for what starter content to create when initializing a project. */
export interface ProjectScaffold {
  /** Suggested starter locations to create */
  starterLocations: Array<{ name: string; description: string }>;
  /** Suggested starter NPC archetypes */
  starterNpcs: Array<{ name: string; role: string; description: string }>;
  /** Whether to create an example scene */
  includeExampleScene: boolean;
  /** Whether to create an example routine graph */
  includeExampleRoutine: boolean;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const LIFE_SIM_PRESET: ProjectPreset = {
  id: 'life_sim',
  label: 'Life Simulation',
  description: 'Focus on NPC daily routines, relationships, and emergent behavior. NPCs live autonomous lives on schedules.',
  gameProfile: {
    style: 'life_sim',
    simulationMode: 'turn_based',
    turnConfig: { turnDeltaSeconds: 3600 },
    behaviorProfile: 'balanced',
    narrativeProfile: 'light',
  },
  manifest: {
    turn_preset: 'ONE_HOUR',
    enabled_plugins: [],
    enabled_campaigns: [],
  },
  scaffold: {
    starterLocations: [
      { name: 'Home', description: 'The player\'s starting residence' },
      { name: 'Town Square', description: 'Central hub connecting other locations' },
      { name: 'Shop', description: 'A place to buy and sell items' },
    ],
    starterNpcs: [
      { name: 'Neighbor', role: 'friend', description: 'A friendly neighbor NPC with a daily routine' },
      { name: 'Shopkeeper', role: 'merchant', description: 'Runs the local shop' },
    ],
    includeExampleScene: false,
    includeExampleRoutine: true,
  },
};

const VISUAL_NOVEL_PRESET: ProjectPreset = {
  id: 'visual_novel',
  label: 'Visual Novel',
  description: 'Focus on branching narrative, dialogue scenes, and player choices. Story-driven with rich scene composition.',
  gameProfile: {
    style: 'visual_novel',
    simulationMode: 'paused',
    behaviorProfile: 'relationship_focused',
    narrativeProfile: 'heavy',
  },
  manifest: {
    enabled_plugins: [],
    enabled_campaigns: [],
  },
  scaffold: {
    starterLocations: [
      { name: 'Opening', description: 'The first scene backdrop' },
    ],
    starterNpcs: [
      { name: 'Protagonist', role: 'main', description: 'The central character the player interacts with' },
    ],
    includeExampleScene: true,
    includeExampleRoutine: false,
  },
};

const HYBRID_PRESET: ProjectPreset = {
  id: 'hybrid',
  label: 'Hybrid',
  description: 'Balanced mix of simulation and narrative. NPCs have routines but story arcs drive progression.',
  gameProfile: {
    style: 'hybrid',
    simulationMode: 'real_time',
    behaviorProfile: 'balanced',
    narrativeProfile: 'moderate',
  },
  manifest: {
    turn_preset: 'ONE_HOUR',
    enabled_plugins: [],
    enabled_campaigns: [],
  },
  scaffold: {
    starterLocations: [
      { name: 'Home', description: 'The player\'s starting residence' },
      { name: 'Meeting Place', description: 'Where key story moments unfold' },
    ],
    starterNpcs: [
      { name: 'Companion', role: 'companion', description: 'A key character with both routine and story involvement' },
    ],
    includeExampleScene: true,
    includeExampleRoutine: true,
  },
};

/** All built-in project presets, keyed by style. */
export const PROJECT_PRESETS: Record<CoreGameStyle, ProjectPreset> = {
  life_sim: LIFE_SIM_PRESET,
  visual_novel: VISUAL_NOVEL_PRESET,
  hybrid: HYBRID_PRESET,
};

/**
 * Get a project preset by style id.
 * Returns the hybrid preset as fallback for unknown styles.
 */
export function getProjectPreset(style: string): ProjectPreset {
  return (PROJECT_PRESETS as Record<string, ProjectPreset>)[style] ?? HYBRID_PRESET;
}

/**
 * Get all available presets as an ordered list (for selection UI).
 */
export function getProjectPresetList(): ProjectPreset[] {
  return [LIFE_SIM_PRESET, VISUAL_NOVEL_PRESET, HYBRID_PRESET];
}

/**
 * Build the initial `world.meta` object for a new project.
 *
 * This produces the meta bag that should be passed to `createGameWorld(name, meta)`.
 * It merges the preset's gameProfile, manifest, and any caller-provided overrides.
 */
export function buildInitialWorldMeta(
  preset: ProjectPreset,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    gameProfile: preset.gameProfile,
    manifest: preset.manifest,
    ...overrides,
  };
}
