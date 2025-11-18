/**
 * Player HUD Preferences Management
 *
 * Manages player-specific HUD customization preferences stored in localStorage.
 * Allows players to override world HUD settings without modifying the world itself.
 */

import type { PlayerHudPreferences, HudToolPlacement } from './types';

const PREFERENCES_STORAGE_KEY = 'pixsim7:player-hud-preferences';

/**
 * Load all player preferences from localStorage
 */
function loadAllPreferences(): Record<number, PlayerHudPreferences> {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    if (typeof parsed !== 'object') {
      console.warn('Invalid player preferences data in localStorage');
      return {};
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load player HUD preferences:', error);
    return {};
  }
}

/**
 * Save all preferences to localStorage
 */
function saveAllPreferences(preferences: Record<number, PlayerHudPreferences>): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save player HUD preferences:', error);
    throw new Error('Failed to save preferences. Storage may be full.');
  }
}

/**
 * Get player preferences for a specific world
 */
export function getPlayerPreferences(worldId: number): PlayerHudPreferences | null {
  const allPrefs = loadAllPreferences();
  return allPrefs[worldId] || null;
}

/**
 * Update player preferences for a specific world
 */
export function updatePlayerPreferences(
  worldId: number,
  updates: Partial<Omit<PlayerHudPreferences, 'worldId' | 'lastUpdated'>>
): PlayerHudPreferences {
  const allPrefs = loadAllPreferences();
  const existing = allPrefs[worldId];

  const updated: PlayerHudPreferences = {
    ...existing,
    ...updates,
    worldId,
    lastUpdated: Date.now(),
  };

  allPrefs[worldId] = updated;
  saveAllPreferences(allPrefs);

  return updated;
}

/**
 * Toggle tool visibility in player preferences
 */
export function toggleToolVisibility(worldId: number, toolId: string): PlayerHudPreferences {
  const prefs = getPlayerPreferences(worldId);
  const currentHidden = prefs?.hiddenTools || [];

  const newHidden = currentHidden.includes(toolId)
    ? currentHidden.filter(id => id !== toolId)
    : [...currentHidden, toolId];

  return updatePlayerPreferences(worldId, {
    hiddenTools: newHidden,
  });
}

/**
 * Set view mode override for player
 */
export function setViewModeOverride(
  worldId: number,
  viewMode: 'cinematic' | 'hud-heavy' | 'debug' | null
): PlayerHudPreferences {
  return updatePlayerPreferences(worldId, {
    viewModeOverride: viewMode || undefined,
  });
}

/**
 * Set tool-specific overrides
 */
export function setToolOverride(
  worldId: number,
  toolId: string,
  overrides: Partial<HudToolPlacement>
): PlayerHudPreferences {
  const prefs = getPlayerPreferences(worldId);
  const currentOverrides = prefs?.toolOverrides || {};

  return updatePlayerPreferences(worldId, {
    toolOverrides: {
      ...currentOverrides,
      [toolId]: overrides,
    },
  });
}

/**
 * Clear all player preferences for a specific world
 */
export function clearPlayerPreferences(worldId: number): void {
  const allPrefs = loadAllPreferences();
  delete allPrefs[worldId];
  saveAllPreferences(allPrefs);
}

/**
 * Clear all player preferences (for all worlds)
 */
export function clearAllPlayerPreferences(): void {
  localStorage.removeItem(PREFERENCES_STORAGE_KEY);
}

/**
 * Apply player preferences to tool placements
 * Returns modified placements with player overrides applied
 */
export function applyPlayerPreferences(
  placements: HudToolPlacement[],
  worldId: number
): HudToolPlacement[] {
  const prefs = getPlayerPreferences(worldId);
  if (!prefs) return placements;

  // Filter out hidden tools
  let result = placements.filter(p => !prefs.hiddenTools?.includes(p.toolId));

  // Apply tool-specific overrides
  if (prefs.toolOverrides) {
    result = result.map(placement => {
      const override = prefs.toolOverrides?.[placement.toolId];
      return override ? { ...placement, ...override } : placement;
    });
  }

  return result;
}

/**
 * Get effective view mode considering player override
 */
export function getEffectiveViewMode(
  worldId: number,
  worldViewMode: 'cinematic' | 'hud-heavy' | 'debug'
): 'cinematic' | 'hud-heavy' | 'debug' {
  const prefs = getPlayerPreferences(worldId);
  return prefs?.viewModeOverride || worldViewMode;
}
