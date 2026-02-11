/**
 * User Content Preferences Module
 *
 * Manages per-browser user content preferences for generation filtering.
 * Preferences are stored via the injected KVStorage and globally constrain all generation.
 *
 * Storage is injected via `configureKVStorage()` — no direct `localStorage` access.
 */

import type { UserContentPreferences } from '@pixsim7/shared.types';
import { getKVStorage } from '../core/storageConfig';

const STORAGE_KEY = 'pixsim7:userContentPreferences';

/**
 * Default content preferences (safe defaults)
 */
const DEFAULT_CONTENT_PREFERENCES: UserContentPreferences = {
  maxContentRating: 'romantic', // Allow light romance by default
  reduceRomanticIntensity: false,
  requireMatureContentConfirmation: true, // Require confirmation for safety
};

/**
 * Load user content preferences from storage
 *
 * @returns User content preferences or defaults
 *
 * @example
 * ```ts
 * const prefs = loadUserContentPreferences();
 * console.log(prefs.maxContentRating); // 'romantic'
 * ```
 */
export function loadUserContentPreferences(): UserContentPreferences {
  try {
    const storage = getKVStorage();
    if (!storage) return DEFAULT_CONTENT_PREFERENCES;
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_CONTENT_PREFERENCES;
    }

    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_CONTENT_PREFERENCES,
      ...parsed,
    };
  } catch (err) {
    console.error('Failed to load user content preferences', err);
    return DEFAULT_CONTENT_PREFERENCES;
  }
}

/**
 * Save user content preferences to storage
 *
 * @param preferences - Content preferences to save
 *
 * @example
 * ```ts
 * saveUserContentPreferences({
 *   maxContentRating: 'mature_implied',
 *   reduceRomanticIntensity: false
 * });
 * ```
 */
export function saveUserContentPreferences(preferences: UserContentPreferences): void {
  try {
    const storage = getKVStorage();
    if (!storage) return;
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (err) {
    console.error('Failed to save user content preferences', err);
  }
}

/**
 * Update specific content preference fields
 *
 * Merges partial updates into existing preferences and saves.
 *
 * @param updates - Partial preference updates
 * @returns Updated preferences
 *
 * @example
 * ```ts
 * updateUserContentPreferences({ maxContentRating: 'sfw' });
 * ```
 */
export function updateUserContentPreferences(
  updates: Partial<UserContentPreferences>
): UserContentPreferences {
  const current = loadUserContentPreferences();
  const updated = {
    ...current,
    ...updates,
  };
  saveUserContentPreferences(updated);
  return updated;
}

/**
 * Reset content preferences to defaults
 *
 * Clears stored preferences and returns to safe defaults.
 *
 * @example
 * ```ts
 * resetUserContentPreferences();
 * ```
 */
export function resetUserContentPreferences(): void {
  const storage = getKVStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

/**
 * Get user's maximum allowed content rating
 *
 * @returns Maximum content rating or undefined if not set
 *
 * @example
 * ```ts
 * const maxRating = getUserMaxContentRating(); // 'romantic'
 * ```
 */
export function getUserMaxContentRating():
  | 'sfw'
  | 'romantic'
  | 'mature_implied'
  | 'restricted'
  | undefined {
  const prefs = loadUserContentPreferences();
  return prefs.maxContentRating;
}

/**
 * Set user's maximum allowed content rating
 *
 * @param rating - Maximum content rating to allow
 * @returns Updated preferences
 *
 * @example
 * ```ts
 * setUserMaxContentRating('sfw'); // Disable all romantic content
 * ```
 */
export function setUserMaxContentRating(
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): UserContentPreferences {
  return updateUserContentPreferences({ maxContentRating: rating });
}

/**
 * Check if user has "reduce romantic intensity" enabled
 *
 * @returns True if romantic intensity should be reduced
 *
 * @example
 * ```ts
 * if (shouldReduceRomanticIntensity()) {
 *   // Reduce intimacy band by one level
 * }
 * ```
 */
export function shouldReduceRomanticIntensity(): boolean {
  const prefs = loadUserContentPreferences();
  return prefs.reduceRomanticIntensity === true;
}

/**
 * Toggle "reduce romantic intensity" preference
 *
 * @param enabled - Whether to enable intensity reduction
 * @returns Updated preferences
 *
 * @example
 * ```ts
 * setReduceRomanticIntensity(true);
 * ```
 */
export function setReduceRomanticIntensity(enabled: boolean): UserContentPreferences {
  return updateUserContentPreferences({ reduceRomanticIntensity: enabled });
}

/**
 * Check if user requires confirmation before mature content
 *
 * @returns True if confirmation is required
 *
 * @example
 * ```ts
 * if (requiresMatureContentConfirmation()) {
 *   // Show confirmation dialog before displaying mature content
 * }
 * ```
 */
export function requiresMatureContentConfirmation(): boolean {
  const prefs = loadUserContentPreferences();
  return prefs.requireMatureContentConfirmation !== false; // Default to true
}

/**
 * Set whether to require confirmation for mature content
 *
 * @param required - Whether confirmation is required
 * @returns Updated preferences
 *
 * @example
 * ```ts
 * setRequireMatureContentConfirmation(false); // Disable confirmation
 * ```
 */
export function setRequireMatureContentConfirmation(required: boolean): UserContentPreferences {
  return updateUserContentPreferences({ requireMatureContentConfirmation: required });
}

/**
 * Check if a content rating is allowed by user preferences
 *
 * Compares against user's maxContentRating setting.
 *
 * @param rating - Content rating to check
 * @returns True if rating is allowed
 *
 * @example
 * ```ts
 * if (isContentRatingAllowed('mature_implied')) {
 *   // Show mature content
 * }
 * ```
 */
export function isContentRatingAllowed(
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): boolean {
  const maxRating = getUserMaxContentRating();
  if (!maxRating) {
    return true; // No restriction
  }

  const hierarchy: Array<'sfw' | 'romantic' | 'mature_implied' | 'restricted'> = [
    'sfw',
    'romantic',
    'mature_implied',
    'restricted',
  ];

  const ratingIndex = hierarchy.indexOf(rating);
  const maxIndex = hierarchy.indexOf(maxRating);

  return ratingIndex <= maxIndex;
}
