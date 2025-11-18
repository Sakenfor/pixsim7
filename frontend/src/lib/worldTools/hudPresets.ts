/**
 * HUD Layout Preset Management
 *
 * Provides utilities for saving and loading HUD layout presets from localStorage.
 * Presets allow reusing HUD configurations across multiple worlds.
 */

import type { HudToolPlacement } from './types';

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
