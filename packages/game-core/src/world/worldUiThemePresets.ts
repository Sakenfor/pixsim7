/**
 * World UI Theme Presets Store
 *
 * Frontend-only storage for theme presets with localStorage persistence.
 * Built-in presets are immutable; custom presets can be created/deleted.
 */

import type { WorldUiTheme } from '@pixsim7/types';
import { THEME_PRESETS } from './worldUiConfig';

const STORAGE_KEY = 'pixsim7:worldUiThemePresets';

export interface WorldUiThemePreset extends WorldUiTheme {
  name: string;
  description?: string;
  isBuiltIn?: boolean;
}

/**
 * Get all built-in theme presets
 */
function getBuiltInPresets(): WorldUiThemePreset[] {
  return Object.values(THEME_PRESETS).map(theme => ({
    ...theme,
    name: formatThemeName(theme.id),
    isBuiltIn: true,
  }));
}

/**
 * Format theme ID into a readable name
 */
function formatThemeName(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Load custom presets from localStorage
 */
function loadCustomPresets(): WorldUiThemePreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load custom theme presets', err);
    return [];
  }
}

/**
 * Save custom presets to localStorage
 */
function saveCustomPresets(presets: WorldUiThemePreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (err) {
    console.error('Failed to save custom theme presets', err);
  }
}

/**
 * Get all theme presets (built-in + custom)
 */
export function getAllThemePresets(): WorldUiThemePreset[] {
  const builtIn = getBuiltInPresets();
  const custom = loadCustomPresets();
  return [...builtIn, ...custom];
}

/**
 * Get a theme preset by ID
 */
export function getThemePresetById(id: string): WorldUiThemePreset | undefined {
  return getAllThemePresets().find(preset => preset.id === id);
}

/**
 * Save a new custom theme preset
 * Returns true if successful, false if ID already exists
 */
export function saveThemePreset(preset: Omit<WorldUiThemePreset, 'isBuiltIn'>): boolean {
  // Check if ID already exists (including built-ins)
  const existing = getThemePresetById(preset.id);
  if (existing) {
    console.warn(`Theme preset '${preset.id}' already exists`);
    return false;
  }

  const custom = loadCustomPresets();
  const newPreset: WorldUiThemePreset = {
    ...preset,
    isBuiltIn: false,
  };

  custom.push(newPreset);
  saveCustomPresets(custom);
  return true;
}

/**
 * Update an existing custom theme preset
 * Returns true if successful, false if preset is built-in or doesn't exist
 */
export function updateThemePreset(id: string, updates: Partial<WorldUiThemePreset>): boolean {
  const custom = loadCustomPresets();
  const index = custom.findIndex(preset => preset.id === id);

  if (index === -1) {
    console.warn(`Custom theme preset '${id}' not found`);
    return false;
  }

  custom[index] = {
    ...custom[index],
    ...updates,
    id: custom[index].id, // Preserve ID
    isBuiltIn: false, // Preserve built-in flag
  };

  saveCustomPresets(custom);
  return true;
}

/**
 * Delete a custom theme preset
 * Returns true if successful, false if preset is built-in or doesn't exist
 */
export function deleteThemePreset(id: string): boolean {
  // Don't allow deleting built-in presets
  const builtIn = THEME_PRESETS[id];
  if (builtIn) {
    console.warn(`Cannot delete built-in theme preset '${id}'`);
    return false;
  }

  const custom = loadCustomPresets();
  const filtered = custom.filter(preset => preset.id !== id);

  if (filtered.length === custom.length) {
    console.warn(`Custom theme preset '${id}' not found`);
    return false;
  }

  saveCustomPresets(filtered);
  return true;
}

/**
 * Create a theme preset from a theme object
 */
export function createThemePresetFromTheme(
  theme: WorldUiTheme,
  name: string,
  description?: string
): WorldUiThemePreset {
  return {
    ...theme,
    name,
    description,
    isBuiltIn: false,
  };
}

/**
 * Generate a unique theme ID from a name
 */
export function generateThemeId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // Check for conflicts and append number if needed
  let id = base;
  let counter = 1;
  while (getThemePresetById(id)) {
    id = `${base}-${counter}`;
    counter++;
  }

  return id;
}

/**
 * Clear all custom theme presets (for testing/reset)
 */
export function clearCustomPresets(): void {
  localStorage.removeItem(STORAGE_KEY);
}
