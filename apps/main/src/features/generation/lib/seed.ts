/**
 * Shared generation seed helpers.
 *
 * Providers commonly expect 31-bit signed integer seed ranges.
 */

export const GENERATION_SEED_MIN = 0;
export const GENERATION_SEED_MAX = 2_147_483_647;

/**
 * Return a random seed in the inclusive range [GENERATION_SEED_MIN, GENERATION_SEED_MAX].
 */
export function nextRandomGenerationSeed(): number {
  const span = GENERATION_SEED_MAX - GENERATION_SEED_MIN + 1;
  return Math.floor(Math.random() * span) + GENERATION_SEED_MIN;
}

