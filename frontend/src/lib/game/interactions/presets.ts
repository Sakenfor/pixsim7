/**
 * Interaction Preset System
 *
 * Provides reusable interaction configurations that designers can apply
 * to NPC slots without manually configuring raw values each time.
 *
 * Presets are stored in GameWorld.meta.interactionPresets for per-world customization.
 */

import type { GameWorldDetail } from '../../api/game';
import { updateGameWorldMeta, saveGameWorldMeta } from '../../api/game';
import type { BaseInteractionConfig } from './types';

/**
 * Interaction preset configuration
 */
export interface InteractionPreset {
  /** Unique preset ID (e.g., 'flirt_friendly') */
  id: string;

  /** Display name (e.g., 'Flirt (Friendly)') */
  name: string;

  /** Plugin/interaction type this preset configures (e.g., 'persuade') */
  interactionId: string;

  /** Plugin-specific configuration */
  config: Record<string, any>;

  /** Category for organization/filtering */
  category?: string;

  /** Description of what this preset does */
  description?: string;

  /** Tags for searching/filtering */
  tags?: string[];

  /** Icon/emoji for visual identification */
  icon?: string;
}

/**
 * Preset category definitions
 */
export const PRESET_CATEGORIES = {
  romance: 'Romance',
  trade: 'Trade',
  combat: 'Combat',
  stealth: 'Stealth',
  social: 'Social',
  quest: 'Quest',
  utility: 'Utility',
  custom: 'Custom',
} as const;

export type PresetCategory = keyof typeof PRESET_CATEGORIES;

/**
 * Get interaction presets from world metadata
 */
export function getWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  if (!world?.meta) return [];

  const presets = (world.meta as any).interactionPresets;
  if (!Array.isArray(presets)) return [];

  return presets;
}

/**
 * Save interaction presets to world metadata
 */
export async function saveWorldInteractionPresets(
  worldId: number,
  presets: InteractionPreset[],
  currentMeta: Record<string, unknown>
): Promise<GameWorldDetail> {
  const updatedMeta = {
    ...currentMeta,
    interactionPresets: presets,
  };

  return await updateGameWorldMeta(worldId, updatedMeta);
}

/**
 * Add a new preset to a world
 */
export async function addInteractionPreset(
  worldId: number,
  preset: InteractionPreset,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);

  // Check for duplicate ID
  if (existingPresets.some((p) => p.id === preset.id)) {
    throw new Error(`Preset with ID "${preset.id}" already exists`);
  }

  const updatedPresets = [...existingPresets, preset];
  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Update an existing preset
 */
export async function updateInteractionPreset(
  worldId: number,
  presetId: string,
  updates: Partial<InteractionPreset>,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);
  const presetIndex = existingPresets.findIndex((p) => p.id === presetId);

  if (presetIndex === -1) {
    throw new Error(`Preset with ID "${presetId}" not found`);
  }

  const updatedPresets = [...existingPresets];
  updatedPresets[presetIndex] = {
    ...updatedPresets[presetIndex],
    ...updates,
  };

  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Delete a preset from a world
 */
export async function deleteInteractionPreset(
  worldId: number,
  presetId: string,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const existingPresets = getWorldInteractionPresets(currentWorld);
  const updatedPresets = existingPresets.filter((p) => p.id !== presetId);

  return await saveWorldInteractionPresets(worldId, updatedPresets, currentWorld.meta || {});
}

/**
 * Find presets by interaction ID
 */
export function getPresetsForInteraction(
  presets: InteractionPreset[],
  interactionId: string
): InteractionPreset[] {
  return presets.filter((p) => p.interactionId === interactionId);
}

/**
 * Find presets by category
 */
export function getPresetsByCategory(
  presets: InteractionPreset[],
  category: string
): InteractionPreset[] {
  return presets.filter((p) => p.category === category);
}

/**
 * Search presets by name or tags
 */
export function searchPresets(presets: InteractionPreset[], query: string): InteractionPreset[] {
  const lowerQuery = query.toLowerCase();
  return presets.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery) ||
      p.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Apply a preset to a slot's interaction config
 */
export function applyPresetToSlot(preset: InteractionPreset): BaseInteractionConfig {
  return {
    enabled: true,
    ...preset.config,
  };
}

/**
 * Validate preset structure
 */
export function validatePreset(preset: Partial<InteractionPreset>): string | null {
  if (!preset.id || preset.id.trim().length === 0) {
    return 'Preset ID is required';
  }

  if (!preset.name || preset.name.trim().length === 0) {
    return 'Preset name is required';
  }

  if (!preset.interactionId || preset.interactionId.trim().length === 0) {
    return 'Interaction ID is required';
  }

  if (!preset.config || typeof preset.config !== 'object') {
    return 'Preset config must be an object';
  }

  return null;
}

/**
 * Generate a unique preset ID from name
 */
export function generatePresetId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${base}_${Date.now().toString(36)}`;
}

/**
 * Built-in preset examples (can be used as templates)
 */
export const EXAMPLE_PRESETS: InteractionPreset[] = [
  {
    id: 'flirt_friendly',
    name: 'Flirt (Friendly)',
    interactionId: 'persuade',
    category: 'romance',
    description: 'A friendly, low-pressure flirtation attempt',
    icon: '💕',
    tags: ['romance', 'friendly', 'low-risk'],
    config: {
      persuasionType: 'flirt',
      difficulty: 'easy',
      baseSuccessChance: 0.7,
      relationshipChange: 5,
    },
  },
  {
    id: 'trade_basic',
    name: 'Trade (Basic)',
    interactionId: 'trade',
    category: 'trade',
    description: 'Basic item trading with fair prices',
    icon: '🛒',
    tags: ['trade', 'shop', 'merchant'],
    config: {
      priceMultiplier: 1.0,
      canBuyBack: true,
      acceptedItemTypes: ['common', 'uncommon'],
    },
  },
  {
    id: 'pickpocket_novice',
    name: 'Pickpocket (Novice)',
    interactionId: 'pickpocket',
    category: 'stealth',
    description: 'Easy pickpocket attempt for beginners',
    icon: '🤏',
    tags: ['stealth', 'theft', 'easy'],
    config: {
      baseSuccessChance: 0.5,
      detectionChance: 0.3,
      onSuccessFlags: ['pickpocket_success'],
      onFailFlags: ['pickpocket_fail'],
    },
  },
];
