/**
 * Phase 6: HUD Profile Management
 *
 * Manages HUD profiles - named configurations that can have different layouts
 * per view mode. Profiles allow players to quickly switch between different
 * HUD setups (e.g., 'default', 'minimal', 'streamer', 'debug').
 */

import type { HudProfile, HudToolPlacement, ViewMode } from './types';
import type { GameWorldDetail } from '@lib/api/game';
import {
  getPlayerPreferences,
  updatePlayerPreferences,
} from './playerHudPreferences';

/**
 * Built-in HUD profiles
 */
export const BUILTIN_PROFILES: HudProfile[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Standard HUD layout',
    icon: '📋',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Minimal HUD for immersive experience',
    icon: '🎯',
  },
  {
    id: 'streamer',
    name: 'Streamer',
    description: 'Optimized for streaming/recording',
    icon: '📹',
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'All tools visible for debugging',
    icon: '🔧',
  },
];

/**
 * Get the currently active profile ID for a world
 */
export function getActiveProfileId(worldId: number): string {
  const prefs = getPlayerPreferences(worldId);
  return prefs?.activeProfileId || 'default';
}

/**
 * Set the active profile for a world
 */
export function setActiveProfile(worldId: number, profileId: string): void {
  updatePlayerPreferences(worldId, {
    activeProfileId: profileId,
  });
}

/**
 * Get all available profiles (built-in + custom)
 */
export function getAvailableProfiles(): HudProfile[] {
  // For now, just return built-in profiles
  // Future: Load custom profiles from localStorage
  return BUILTIN_PROFILES;
}

/**
 * Get a specific profile by ID
 */
export function getProfile(profileId: string): HudProfile | null {
  return BUILTIN_PROFILES.find((p) => p.id === profileId) || null;
}

/**
 * Build profile layout key for storing in WorldUiConfig.profileLayouts
 * Format: "profileId" or "profileId:viewMode"
 */
export function buildProfileLayoutKey(
  profileId: string,
  viewMode?: ViewMode
): string {
  return viewMode ? `${profileId}:${viewMode}` : profileId;
}

/**
 * Parse a profile layout key back into components
 */
export function parseProfileLayoutKey(key: string): {
  profileId: string;
  viewMode?: ViewMode;
} {
  const parts = key.split(':');
  if (parts.length === 2) {
    return {
      profileId: parts[0],
      viewMode: parts[1] as ViewMode,
    };
  }
  return { profileId: key };
}

/**
 * Get the layout for a specific profile and view mode
 * Returns null if no profile-specific layout is defined
 */
export function getProfileLayout(
  worldDetail: GameWorldDetail,
  profileId: string,
  viewMode?: ViewMode
): HudToolPlacement[] | null {
  if (!worldDetail.meta?.ui) return null;

  const ui = worldDetail.meta.ui as any;
  const profileLayouts = ui.profileLayouts as Record<string, HudToolPlacement[]> | undefined;

  if (!profileLayouts) return null;

  // Try exact match first (profileId:viewMode)
  if (viewMode) {
    const exactKey = buildProfileLayoutKey(profileId, viewMode);
    if (profileLayouts[exactKey]) {
      return profileLayouts[exactKey];
    }
  }

  // Fall back to profile-level layout (without view mode)
  const profileKey = buildProfileLayoutKey(profileId);
  return profileLayouts[profileKey] || null;
}

/**
 * Save a layout for a specific profile and optional view mode
 * Returns updated world metadata
 */
export function saveProfileLayout(
  worldDetail: GameWorldDetail,
  profileId: string,
  placements: HudToolPlacement[],
  viewMode?: ViewMode
): Record<string, unknown> {
  const ui = (worldDetail.meta?.ui as any) || {};
  const existingProfileLayouts = ui.profileLayouts || {};

  const key = buildProfileLayoutKey(profileId, viewMode);

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      profileLayouts: {
        ...existingProfileLayouts,
        [key]: placements,
      },
    },
  };

  return updatedMeta;
}

/**
 * Delete a profile layout
 * Returns updated world metadata
 */
export function deleteProfileLayout(
  worldDetail: GameWorldDetail,
  profileId: string,
  viewMode?: ViewMode
): Record<string, unknown> {
  const ui = (worldDetail.meta?.ui as any) || {};
  const existingProfileLayouts = ui.profileLayouts || {};

  const key = buildProfileLayoutKey(profileId, viewMode);
  const { [key]: removed, ...remainingLayouts } = existingProfileLayouts;

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      profileLayouts: remainingLayouts,
    },
  };

  return updatedMeta;
}

/**
 * Get all profile layout keys defined for a world
 */
export function getProfileLayoutKeys(worldDetail: GameWorldDetail): string[] {
  if (!worldDetail.meta?.ui) return [];

  const ui = worldDetail.meta.ui as any;
  const profileLayouts = ui.profileLayouts as Record<string, HudToolPlacement[]> | undefined;

  return Object.keys(profileLayouts || {});
}

/**
 * Check if a world has any profile-specific layouts
 */
export function hasProfileLayouts(worldDetail: GameWorldDetail): boolean {
  return getProfileLayoutKeys(worldDetail).length > 0;
}

/**
 * Get all profiles that have layouts defined for a world
 */
export function getProfilesWithLayouts(worldDetail: GameWorldDetail): string[] {
  const keys = getProfileLayoutKeys(worldDetail);
  const profileIds = new Set<string>();

  for (const key of keys) {
    const { profileId } = parseProfileLayoutKey(key);
    profileIds.add(profileId);
  }

  return Array.from(profileIds);
}
