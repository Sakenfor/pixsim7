/**
 * Interaction Presets System
 *
 * Provides reusable interaction configurations for designers.
 * Presets can be stored per-world in GameWorld.meta.interactionPresets.
 */

import type { BaseInteractionConfig } from './types';
import type { GameWorldDetail } from '../../../lib/api/game';

/**
 * A reusable interaction configuration preset
 */
export interface InteractionPreset {
  /** Unique identifier for this preset */
  id: string;

  /** Display name for designers */
  name: string;

  /** The interaction plugin ID this preset applies to */
  interactionId: string;

  /** The full configuration for the interaction plugin */
  config: Record<string, any>;

  /** Optional category for organizing presets */
  category?: string;

  /** Optional tags for filtering/searching */
  tags?: string[];

  /** Optional description */
  description?: string;
}

/**
 * Load interaction presets from a world's meta
 */
export function loadWorldInteractionPresets(world: GameWorldDetail): InteractionPreset[] {
  if (!world.meta) {
    return [];
  }
  const meta = world.meta as any;
  return (meta.interactionPresets as InteractionPreset[]) || [];
}

/**
 * Set interaction presets in a world's meta (immutable update)
 */
export function setWorldInteractionPresets(
  world: GameWorldDetail,
  presets: InteractionPreset[]
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      interactionPresets: presets,
    },
  };
}

/**
 * Add a new preset to a world (immutable)
 */
export function addInteractionPreset(
  world: GameWorldDetail,
  preset: InteractionPreset
): GameWorldDetail {
  const existingPresets = loadWorldInteractionPresets(world);

  // Check for duplicate IDs
  if (existingPresets.some(p => p.id === preset.id)) {
    throw new Error(`Preset with ID "${preset.id}" already exists`);
  }

  return setWorldInteractionPresets(world, [...existingPresets, preset]);
}

/**
 * Update an existing preset in a world (immutable)
 */
export function updateInteractionPreset(
  world: GameWorldDetail,
  presetId: string,
  updates: Partial<Omit<InteractionPreset, 'id'>>
): GameWorldDetail {
  const existingPresets = loadWorldInteractionPresets(world);
  const index = existingPresets.findIndex(p => p.id === presetId);

  if (index === -1) {
    throw new Error(`Preset with ID "${presetId}" not found`);
  }

  const updatedPresets = [...existingPresets];
  updatedPresets[index] = { ...updatedPresets[index], ...updates };

  return setWorldInteractionPresets(world, updatedPresets);
}

/**
 * Remove a preset from a world (immutable)
 */
export function removeInteractionPreset(
  world: GameWorldDetail,
  presetId: string
): GameWorldDetail {
  const existingPresets = loadWorldInteractionPresets(world);
  const filteredPresets = existingPresets.filter(p => p.id !== presetId);

  if (filteredPresets.length === existingPresets.length) {
    throw new Error(`Preset with ID "${presetId}" not found`);
  }

  return setWorldInteractionPresets(world, filteredPresets);
}

/**
 * Get a single preset by ID
 */
export function getInteractionPreset(
  world: GameWorldDetail,
  presetId: string
): InteractionPreset | null {
  const presets = loadWorldInteractionPresets(world);
  return presets.find(p => p.id === presetId) || null;
}

/**
 * Filter presets by interaction ID
 */
export function getPresetsForInteraction(
  world: GameWorldDetail,
  interactionId: string
): InteractionPreset[] {
  const presets = loadWorldInteractionPresets(world);
  return presets.filter(p => p.interactionId === interactionId);
}

/**
 * Filter presets by category
 */
export function getPresetsByCategory(
  world: GameWorldDetail,
  category: string
): InteractionPreset[] {
  const presets = loadWorldInteractionPresets(world);
  return presets.filter(p => p.category === category);
}

/**
 * Generate a unique preset ID based on name
 */
export function generatePresetId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${slug}_${Date.now()}`;
}
