/**
 * HUD Layout Preset Management
 *
 * Provides utilities for saving and loading HUD layout presets from localStorage.
 * Presets allow reusing HUD configurations across multiple worlds.
 */

import type { HudToolPlacement } from './types';

/**
 * Phase 7: Preset scope
 */
export type PresetScope = 'local' | 'world' | 'global';

/**
 * HUD Layout Preset definition
 */
export interface HudLayoutPreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Tool placements in this preset */
  placements: HudToolPlacement[];
  /** Phase 7: Scope of the preset (local, world, or global) */
  scope?: PresetScope;
  /** Phase 7: World ID for world-scoped presets */
  worldId?: number;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when last modified */
  updatedAt: number;
}

/**
 * localStorage key for storing presets
 */
const PRESETS_STORAGE_KEY = 'pixsim7:hud-layout-presets';

/**
 * Load all presets from localStorage
 */
export function loadPresets(): HudLayoutPreset[] {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      console.warn('Invalid presets data in localStorage');
      return [];
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load HUD layout presets:', error);
    return [];
  }
}

/**
 * Save presets to localStorage
 */
function savePresetsToStorage(presets: HudLayoutPreset[]): void {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Failed to save HUD layout presets:', error);
    throw new Error('Failed to save presets. Storage may be full.');
  }
}

/**
 * Get a specific preset by ID
 */
export function getPreset(id: string): HudLayoutPreset | null {
  const presets = loadPresets();
  return presets.find((p) => p.id === id) || null;
}

/**
 * Create a new preset
 */
export function createPreset(
  name: string,
  placements: HudToolPlacement[],
  description?: string
): HudLayoutPreset {
  const now = Date.now();
  const preset: HudLayoutPreset = {
    id: `preset-${now}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    placements: JSON.parse(JSON.stringify(placements)), // Deep clone
    createdAt: now,
    updatedAt: now,
  };

  const presets = loadPresets();
  presets.push(preset);
  savePresetsToStorage(presets);

  return preset;
}

/**
 * Update an existing preset
 */
export function updatePreset(
  id: string,
  updates: Partial<Pick<HudLayoutPreset, 'name' | 'description' | 'placements'>>
): HudLayoutPreset | null {
  const presets = loadPresets();
  const index = presets.findIndex((p) => p.id === id);

  if (index === -1) {
    console.warn(`Preset not found: ${id}`);
    return null;
  }

  const preset = presets[index];
  const updated: HudLayoutPreset = {
    ...preset,
    ...updates,
    updatedAt: Date.now(),
  };

  presets[index] = updated;
  savePresetsToStorage(presets);

  return updated;
}

/**
 * Delete a preset
 */
export function deletePreset(id: string): boolean {
  const presets = loadPresets();
  const filtered = presets.filter((p) => p.id !== id);

  if (filtered.length === presets.length) {
    console.warn(`Preset not found: ${id}`);
    return false;
  }

  savePresetsToStorage(filtered);
  return true;
}

/**
 * Get all preset names (for dropdown lists)
 */
export function getPresetNames(): Array<{ id: string; name: string }> {
  const presets = loadPresets();
  return presets.map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Export preset to JSON string (for sharing)
 */
export function exportPreset(id: string): string | null {
  const preset = getPreset(id);
  if (!preset) return null;
  return JSON.stringify(preset, null, 2);
}

/**
 * Import preset from JSON string
 */
export function importPreset(jsonString: string): HudLayoutPreset | null {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate structure
    if (!parsed.name || !Array.isArray(parsed.placements)) {
      throw new Error('Invalid preset format');
    }

    // Create new preset with imported data
    return createPreset(
      parsed.name,
      parsed.placements,
      parsed.description
    );
  } catch (error) {
    console.error('Failed to import preset:', error);
    return null;
  }
}

/**
 * Clear all presets (useful for testing/reset)
 */
export function clearAllPresets(): void {
  localStorage.removeItem(PRESETS_STORAGE_KEY);
}

// ============================================================================
// Phase 7: World-Scoped Presets
// ============================================================================

import type { GameWorldDetail, WorldUiConfig } from '../api/game';

/**
 * Get world presets from a GameWorld
 */
export function getWorldPresets(worldDetail: GameWorldDetail): HudLayoutPreset[] {
  if (!worldDetail.meta?.ui) return [];

  const ui = worldDetail.meta.ui as WorldUiConfig;
  const worldPresets = ui.worldPresets || [];

  // Convert to HudLayoutPreset format with scope
  return worldPresets.map((preset) => ({
    ...preset,
    scope: 'world' as const,
    worldId: worldDetail.id,
  }));
}

/**
 * Get all presets for a world (local + world-scoped)
 * Returns presets sorted by scope (local first, then world)
 */
export function getAllPresets(worldDetail: GameWorldDetail | null): HudLayoutPreset[] {
  const localPresets = loadPresets().map(p => ({
    ...p,
    scope: (p.scope || 'local') as PresetScope,
  }));

  if (!worldDetail) {
    return localPresets;
  }

  const worldPresets = getWorldPresets(worldDetail);

  // Merge and return (local first, then world)
  return [...localPresets, ...worldPresets];
}

/**
 * Publish a local preset to world scope
 * Returns updated world metadata
 */
export function publishPresetToWorld(
  worldDetail: GameWorldDetail,
  presetId: string
): Record<string, unknown> | null {
  const preset = getPreset(presetId);
  if (!preset) {
    console.warn(`Preset not found: ${presetId}`);
    return null;
  }

  const ui = (worldDetail.meta?.ui as WorldUiConfig) || {};
  const existingWorldPresets = ui.worldPresets || [];

  // Check if preset with same ID already exists in world presets
  const existingIndex = existingWorldPresets.findIndex(p => p.id === presetId);

  let updatedWorldPresets;
  if (existingIndex >= 0) {
    // Update existing world preset
    updatedWorldPresets = [...existingWorldPresets];
    updatedWorldPresets[existingIndex] = {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      placements: preset.placements,
      createdAt: preset.createdAt,
      updatedAt: Date.now(),
    };
  } else {
    // Add new world preset
    updatedWorldPresets = [
      ...existingWorldPresets,
      {
        id: preset.id,
        name: preset.name,
        description: preset.description,
        placements: preset.placements,
        createdAt: preset.createdAt,
        updatedAt: Date.now(),
      },
    ];
  }

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      worldPresets: updatedWorldPresets,
    },
  };

  return updatedMeta;
}

/**
 * Copy a world preset to local presets
 */
export function copyWorldPresetToLocal(
  worldDetail: GameWorldDetail,
  presetId: string
): HudLayoutPreset | null {
  const worldPresets = getWorldPresets(worldDetail);
  const preset = worldPresets.find(p => p.id === presetId);

  if (!preset) {
    console.warn(`World preset not found: ${presetId}`);
    return null;
  }

  // Create a new local preset with a new ID to avoid conflicts
  const now = Date.now();
  const newId = `preset-${now}-${Math.random().toString(36).substr(2, 9)}`;

  const localPreset: HudLayoutPreset = {
    id: newId,
    name: `${preset.name} (Copy)`,
    description: preset.description,
    placements: JSON.parse(JSON.stringify(preset.placements)), // Deep clone
    scope: 'local',
    createdAt: now,
    updatedAt: now,
  };

  // Save to localStorage
  const presets = loadPresets();
  presets.push(localPreset);
  savePresetsToStorage(presets);

  return localPreset;
}

/**
 * Delete a world preset
 * Returns updated world metadata
 */
export function deleteWorldPreset(
  worldDetail: GameWorldDetail,
  presetId: string
): Record<string, unknown> | null {
  const ui = (worldDetail.meta?.ui as WorldUiConfig) || {};
  const existingWorldPresets = ui.worldPresets || [];

  const filtered = existingWorldPresets.filter(p => p.id !== presetId);

  if (filtered.length === existingWorldPresets.length) {
    console.warn(`World preset not found: ${presetId}`);
    return null;
  }

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      worldPresets: filtered,
    },
  };

  return updatedMeta;
}

/**
 * Check if a preset ID exists in world presets
 */
export function isWorldPreset(worldDetail: GameWorldDetail, presetId: string): boolean {
  const worldPresets = getWorldPresets(worldDetail);
  return worldPresets.some(p => p.id === presetId);
}
