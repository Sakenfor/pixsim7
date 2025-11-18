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
 * Load interaction presets from world (alias for getWorldInteractionPresets)
 */
export function loadWorldInteractionPresets(world: GameWorldDetail | null): InteractionPreset[] {
  return getWorldInteractionPresets(world);
}

/**
 * Set interaction presets on a world (returns updated world object without saving)
 */
export function setWorldInteractionPresets(
  world: GameWorldDetail,
  presets: InteractionPreset[]
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...world.meta,
      interactionPresets: presets,
    },
  };
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
 * Attaches preset ID for usage tracking
 */
export function applyPresetToSlot(preset: InteractionPreset): BaseInteractionConfig {
  return {
    enabled: true,
    ...preset.config,
    __presetId: preset.id, // Metadata for usage tracking
    __presetName: preset.name, // Store name for reference
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
 * Preset with scope information
 */
export interface PresetWithScope extends InteractionPreset {
  scope: 'global' | 'world';
}

/**
 * PHASE 4: Global Preset Support
 * Global presets are stored in localStorage and available across all worlds
 */

const GLOBAL_PRESETS_KEY = 'pixsim7:global-interaction-presets';

/**
 * Get global presets from localStorage
 */
export function getGlobalInteractionPresets(): InteractionPreset[] {
  try {
    const stored = localStorage.getItem(GLOBAL_PRESETS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (e) {
    console.error('Failed to load global presets:', e);
    return [];
  }
}

/**
 * Save global presets to localStorage
 */
export function saveGlobalInteractionPresets(presets: InteractionPreset[]): void {
  try {
    localStorage.setItem(GLOBAL_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save global presets:', e);
    throw new Error('Failed to save global presets');
  }
}

/**
 * Add a global preset
 */
export function addGlobalPreset(preset: InteractionPreset): void {
  const existing = getGlobalInteractionPresets();

  if (existing.some((p) => p.id === preset.id)) {
    throw new Error(`Global preset with ID "${preset.id}" already exists`);
  }

  saveGlobalInteractionPresets([...existing, preset]);
}

/**
 * Update a global preset
 */
export function updateGlobalPreset(
  presetId: string,
  updates: Partial<InteractionPreset>
): void {
  const existing = getGlobalInteractionPresets();
  const index = existing.findIndex((p) => p.id === presetId);

  if (index === -1) {
    throw new Error(`Global preset with ID "${presetId}" not found`);
  }

  const updated = [...existing];
  updated[index] = { ...updated[index], ...updates };

  saveGlobalInteractionPresets(updated);
}

/**
 * Delete a global preset
 */
export function deleteGlobalPreset(presetId: string): void {
  const existing = getGlobalInteractionPresets();
  const filtered = existing.filter((p) => p.id !== presetId);

  saveGlobalInteractionPresets(filtered);
}

/**
 * Get combined presets (global + world) with scope information
 */
export function getCombinedPresets(world: GameWorldDetail | null): PresetWithScope[] {
  const globalPresets = getGlobalInteractionPresets().map((p) => ({
    ...p,
    scope: 'global' as const,
  }));

  const worldPresets = getWorldInteractionPresets(world).map((p) => ({
    ...p,
    scope: 'world' as const,
  }));

  return [...globalPresets, ...worldPresets];
}

/**
 * Copy a world preset to global
 */
export function promotePresetToGlobal(preset: InteractionPreset): void {
  const global = getGlobalInteractionPresets();

  // Check for conflicts
  if (global.some((p) => p.id === preset.id)) {
    // Generate new ID to avoid conflicts
    const newId = generatePresetId(preset.name);
    addGlobalPreset({ ...preset, id: newId });
  } else {
    addGlobalPreset(preset);
  }
}

/**
 * Copy a global preset to world
 */
export async function copyPresetToWorld(
  preset: InteractionPreset,
  worldId: number,
  currentWorld: GameWorldDetail
): Promise<GameWorldDetail> {
  const worldPresets = getWorldInteractionPresets(currentWorld);

  // Check for conflicts
  if (worldPresets.some((p) => p.id === preset.id)) {
    // Generate new ID to avoid conflicts
    const newId = generatePresetId(preset.name);
    return await addInteractionPreset(worldId, { ...preset, id: newId }, currentWorld);
  } else {
    return await addInteractionPreset(worldId, preset, currentWorld);
  }
}

/**
 * PHASE 5: Preset Usage Tracking (Dev-Only)
 * Tracks how often presets are used in interactions
 */

const PRESET_USAGE_KEY = 'pixsim7:preset-usage-stats';

export interface PresetUsageStats {
  [presetId: string]: {
    count: number;
    lastUsed: number; // timestamp
    presetName?: string;
  };
}

/**
 * Get preset usage statistics
 */
export function getPresetUsageStats(): PresetUsageStats {
  try {
    const stored = localStorage.getItem(PRESET_USAGE_KEY);
    if (!stored) return {};

    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load preset usage stats:', e);
    return {};
  }
}

/**
 * Save preset usage statistics
 */
function savePresetUsageStats(stats: PresetUsageStats): void {
  try {
    localStorage.setItem(PRESET_USAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.error('Failed to save preset usage stats:', e);
  }
}

/**
 * Track a preset usage
 */
export function trackPresetUsage(presetId: string, presetName?: string): void {
  const stats = getPresetUsageStats();

  if (!stats[presetId]) {
    stats[presetId] = {
      count: 0,
      lastUsed: Date.now(),
      presetName,
    };
  }

  stats[presetId].count += 1;
  stats[presetId].lastUsed = Date.now();
  if (presetName) {
    stats[presetId].presetName = presetName;
  }

  savePresetUsageStats(stats);
}

/**
 * Clear preset usage statistics
 */
export function clearPresetUsageStats(): void {
  try {
    localStorage.removeItem(PRESET_USAGE_KEY);
  } catch (e) {
    console.error('Failed to clear preset usage stats:', e);
  }
}

/**
 * Get preset usage statistics with preset details
 */
export function getPresetUsageStatsWithDetails(
  world: GameWorldDetail | null
): Array<{ presetId: string; presetName: string; count: number; lastUsed: number; scope?: 'global' | 'world' }> {
  const stats = getPresetUsageStats();
  const presets = getCombinedPresets(world);

  return Object.entries(stats)
    .map(([presetId, data]) => {
      const preset = presets.find(p => p.id === presetId);
      return {
        presetId,
        presetName: preset?.name || data.presetName || presetId,
        count: data.count,
        lastUsed: data.lastUsed,
        scope: preset?.scope,
      };
    })
    .sort((a, b) => b.count - a.count); // Sort by usage count descending
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
