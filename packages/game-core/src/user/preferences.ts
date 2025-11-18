/**
 * User UI Preferences Module
 *
 * Manages per-browser user preferences for accessibility and personalization.
 * Preferences are stored in localStorage and override world themes.
 */

import type { UserUiPreferences } from '@pixsim7/types';

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
 * Load user preferences from localStorage
 */
export function loadUserPreferences(): UserUiPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
 * Save user preferences to localStorage
 */
export function saveUserPreferences(preferences: UserUiPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
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
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if user has high contrast mode enabled
 */
export function isHighContrastEnabled(): boolean {
  const prefs = loadUserPreferences();
  return prefs.prefersHighContrast === true;
}

/**
 * Check if user has reduced motion enabled
 */
export function isReducedMotionEnabled(): boolean {
  const prefs = loadUserPreferences();
  // Check both user preference and system preference
  return (
    prefs.prefersReducedMotion === true ||
    (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/**
 * Get the effective color scheme (considering user preference and system preference)
 */
export function getEffectiveColorScheme(): 'light' | 'dark' {
  const prefs = loadUserPreferences();

  if (prefs.colorScheme === 'light' || prefs.colorScheme === 'dark') {
    return prefs.colorScheme;
  }

  // Auto: use system preference
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
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
