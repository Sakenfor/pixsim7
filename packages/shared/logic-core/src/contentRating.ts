/**
 * Content Rating Utilities
 *
 * Shared helpers for content rating normalization, clamping, and comparison.
 * Canonical scale: sfw | romantic | mature_implied | restricted
 *
 * @see pixsim7/backend/main/shared/content_rating.py - Python counterpart
 */

import type { ContentRating } from '@pixsim7/shared.types';

/**
 * Canonical content rating order (least to most permissive)
 */
export const CONTENT_RATING_ORDER = [
  'sfw',
  'romantic',
  'mature_implied',
  'restricted',
] as const;

/**
 * Get the index of a content rating in the hierarchy.
 * Returns 0 (sfw) if value is not recognized.
 *
 * @param value - Content rating string
 * @returns Index in CONTENT_RATING_ORDER (0-3), defaults to 0 for unknown values
 */
export function getContentRatingIndex(value: string | undefined): number {
  if (!value) return 0;
  const index = CONTENT_RATING_ORDER.indexOf(value as ContentRating);
  return index >= 0 ? index : 0;
}

/**
 * Normalize a content rating value to the canonical scale.
 * Returns 'sfw' for undefined, empty, or unrecognized values.
 *
 * @param value - Raw content rating string (may be undefined or invalid)
 * @returns Normalized content rating
 */
export function normalizeContentRating(value?: string): ContentRating {
  if (!value) return 'sfw';
  const index = CONTENT_RATING_ORDER.indexOf(value as ContentRating);
  return index >= 0 ? (value as ContentRating) : 'sfw';
}

/**
 * Clamp content rating to the most restrictive of world and user maximums.
 *
 * @param value - Proposed content rating
 * @param worldMax - World's maximum allowed rating (optional)
 * @param userMax - User's maximum allowed rating (optional)
 * @returns Clamped rating (most restrictive of value, worldMax, userMax)
 *
 * @example
 * clampContentRating("mature_implied", "romantic", undefined)
 * // => "romantic"
 *
 * clampContentRating("sfw", "restricted", "romantic")
 * // => "sfw"
 */
export function clampContentRating(
  value: string,
  worldMax?: string,
  userMax?: string
): ContentRating {
  const rating = normalizeContentRating(value);
  const ratingIndex = getContentRatingIndex(rating);

  // Start with maximum possible index
  let effectiveMaxIndex = CONTENT_RATING_ORDER.length - 1;

  // Apply world constraint
  if (worldMax) {
    const worldIndex = getContentRatingIndex(worldMax);
    effectiveMaxIndex = Math.min(effectiveMaxIndex, worldIndex);
  }

  // Apply user constraint
  if (userMax) {
    const userIndex = getContentRatingIndex(userMax);
    effectiveMaxIndex = Math.min(effectiveMaxIndex, userIndex);
  }

  // Clamp rating to max
  if (ratingIndex > effectiveMaxIndex) {
    return CONTENT_RATING_ORDER[effectiveMaxIndex];
  }

  return rating;
}

/**
 * Check if a content rating is allowed within a maximum constraint.
 *
 * @param value - Content rating to check
 * @param maxRating - Maximum allowed rating
 * @returns True if value is at or below maxRating in the hierarchy
 *
 * @example
 * isContentRatingAllowed("romantic", "mature_implied")
 * // => true
 *
 * isContentRatingAllowed("restricted", "romantic")
 * // => false
 */
export function isContentRatingAllowed(value: string, maxRating: string): boolean {
  const valueIndex = getContentRatingIndex(normalizeContentRating(value));
  const maxIndex = getContentRatingIndex(normalizeContentRating(maxRating));
  return valueIndex <= maxIndex;
}
