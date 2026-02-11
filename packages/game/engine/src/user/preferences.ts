/**
 * User UI Preferences Module
 *
 * Manages per-browser user preferences for accessibility and personalization.
 * Preferences are stored via the injected KVStorage and override world themes.
 *
 * Storage is injected via `configureKVStorage()` — no direct `localStorage` access.
 */

import type { UserUiPreferences } from '@pixsim7/shared.types';
import { getKVStorage } from '../core/storageConfig';

const STORAGE_KEY = 'pixsim7:userUiPreferences';

/**
 * Default user preferences (everything disabled/auto)
 */
const DEFAULT_PREFERENCES: UserUiPreferences = {
  prefersHighContrast: false,
  preferredDensity: undefined, // Use theme default
  prefersReducedMotion: false,
  colorScheme: 'auto',
};

/**
 * Load user preferences from storage
 */
export function loadUserPreferences(): UserUiPreferences {
  try {
    const storage = getKVStorage();
    if (!storage) return DEFAULT_PREFERENCES;
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
    };
  } catch (err) {
    console.error('Failed to load user UI preferences', err);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save user preferences to storage
 */
export function saveUserPreferences(preferences: UserUiPreferences): void {
  try {
    const storage = getKVStorage();
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (err) {
    console.error('Failed to save user UI preferences', err);
  }
}

/**
 * Update specific user preference fields
 */
export function updateUserPreferences(updates: Partial<UserUiPreferences>): UserUiPreferences {
  const current = loadUserPreferences();
  const updated = {
    ...current,
    ...updates,
  };
  saveUserPreferences(updated);
  return updated;
}

/**
 * Reset user preferences to defaults
 */
export function resetUserPreferences(): void {
  const storage = getKVStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

/**
 * Check if user has high contrast mode enabled
 */
export function isHighContrastEnabled(): boolean {
  const prefs = loadUserPreferences();
  return prefs.prefersHighContrast === true;
}

/**
 * Check if user has reduced motion enabled.
 *
 * @param matchMedia - Optional media query function for system preference detection.
 *   Pass `window.matchMedia` in browser contexts.  Omit in headless/test environments.
 */
export function isReducedMotionEnabled(
  matchMedia?: (query: string) => { matches: boolean },
): boolean {
  const prefs = loadUserPreferences();
  // Check both user preference and system preference
  return (
    prefs.prefersReducedMotion === true ||
    (matchMedia != null && matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/**
 * Get the effective color scheme (considering user preference and system preference).
 *
 * @param matchMedia - Optional media query function for system preference detection.
 *   Pass `window.matchMedia` in browser contexts.  Omit in headless/test environments.
 */
export function getEffectiveColorScheme(
  matchMedia?: (query: string) => { matches: boolean },
): 'light' | 'dark' {
  const prefs = loadUserPreferences();

  if (prefs.colorScheme === 'light' || prefs.colorScheme === 'dark') {
    return prefs.colorScheme;
  }

  // Auto: use system preference
  if (matchMedia != null && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

/**
 * Get the effective density (user preference overrides theme)
 */
export function getEffectiveDensity(
  themeDensity: 'compact' | 'comfortable' | 'spacious' | undefined
): 'compact' | 'comfortable' | 'spacious' {
  const prefs = loadUserPreferences();
  return prefs.preferredDensity || themeDensity || 'comfortable';
}
