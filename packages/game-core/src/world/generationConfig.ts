/**
 * World Generation Config Helpers
 *
 * Pure, immutable helpers for working with GameWorld.meta.generation
 * Provides type-safe access to generation configuration stored in world meta
 *
 * @authority CLIENT_FALLBACK
 * These helpers provide client-side access to world configuration.
 * Backend is authoritative for applying generation constraints at runtime.
 *
 * @use_cases Editor tools, generation node configuration, previews
 */

import type { GameWorldDetail, WorldGenerationConfig } from '@pixsim7/types';

/**
 * Get generation config from world meta
 *
 * Returns the generation configuration block from world.meta.generation
 * or an empty object if not present.
 *
 * @param world - Game world to read config from
 * @returns Generation configuration object
 *
 * @example
 * ```ts
 * const config = getWorldGenerationConfig(world);
 * console.log(config.maxContentRating); // 'romantic'
 * ```
 */
export function getWorldGenerationConfig(world: GameWorldDetail): WorldGenerationConfig {
  if (!world.meta || typeof world.meta !== 'object') {
    return {};
  }

  const generation = (world.meta as Record<string, unknown>).generation;

  if (!generation || typeof generation !== 'object') {
    return {};
  }

  return generation as WorldGenerationConfig;
}

/**
 * Set generation config in world meta (immutable)
 *
 * Returns a NEW world with updated generation config.
 * Does not mutate the original world.
 *
 * @param world - Game world to update
 * @param config - Generation config to set
 * @returns New world with updated config
 *
 * @example
 * ```ts
 * const newWorld = setWorldGenerationConfig(world, {
 *   stylePresetId: 'soft_romance',
 *   maxContentRating: 'romantic'
 * });
 * ```
 */
export function setWorldGenerationConfig(
  world: GameWorldDetail,
  config: WorldGenerationConfig
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      generation: config,
    },
  };
}

/**
 * Update generation config in world meta (immutable, partial)
 *
 * Merges partial config updates into existing generation config.
 * Returns a NEW world without mutating the original.
 *
 * @param world - Game world to update
 * @param updates - Partial config updates to merge
 * @returns New world with merged config
 *
 * @example
 * ```ts
 * const newWorld = updateWorldGenerationConfig(world, {
 *   maxContentRating: 'mature_implied'
 * });
 * ```
 */
export function updateWorldGenerationConfig(
  world: GameWorldDetail,
  updates: Partial<WorldGenerationConfig>
): GameWorldDetail {
  const currentConfig = getWorldGenerationConfig(world);

  return setWorldGenerationConfig(world, {
    ...currentConfig,
    ...updates,
  });
}

/**
 * Get maximum content rating from world config
 *
 * Returns the maxContentRating setting or undefined if not set.
 *
 * @param world - Game world to read from
 * @returns Maximum content rating or undefined
 *
 * @example
 * ```ts
 * const maxRating = getWorldMaxContentRating(world); // 'romantic'
 * ```
 */
export function getWorldMaxContentRating(
  world: GameWorldDetail
): 'sfw' | 'romantic' | 'mature_implied' | 'restricted' | undefined {
  const config = getWorldGenerationConfig(world);
  return config.maxContentRating;
}

/**
 * Set maximum content rating in world config (immutable)
 *
 * @param world - Game world to update
 * @param rating - Maximum content rating to set
 * @returns New world with updated rating
 *
 * @example
 * ```ts
 * const newWorld = setWorldMaxContentRating(world, 'romantic');
 * ```
 */
export function setWorldMaxContentRating(
  world: GameWorldDetail,
  rating: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): GameWorldDetail {
  return updateWorldGenerationConfig(world, { maxContentRating: rating });
}

/**
 * Get style preset ID from world config
 *
 * Returns the stylePresetId setting or undefined if not set.
 *
 * @param world - Game world to read from
 * @returns Style preset ID or undefined
 *
 * @example
 * ```ts
 * const styleId = getWorldStylePreset(world); // 'soft_romance'
 * ```
 */
export function getWorldStylePreset(world: GameWorldDetail): string | undefined {
  const config = getWorldGenerationConfig(world);
  return config.stylePresetId;
}

/**
 * Set style preset ID in world config (immutable)
 *
 * @param world - Game world to update
 * @param presetId - Style preset ID to set
 * @returns New world with updated preset
 *
 * @example
 * ```ts
 * const newWorld = setWorldStylePreset(world, 'mystery_thriller');
 * ```
 */
export function setWorldStylePreset(world: GameWorldDetail, presetId: string): GameWorldDetail {
  return updateWorldGenerationConfig(world, { stylePresetId: presetId });
}

/**
 * Get default generation strategy from world config
 *
 * Returns the defaultStrategy setting or undefined if not set.
 *
 * @param world - Game world to read from
 * @returns Default generation strategy or undefined
 *
 * @example
 * ```ts
 * const strategy = getWorldDefaultStrategy(world); // 'per_playthrough'
 * ```
 */
export function getWorldDefaultStrategy(
  world: GameWorldDetail
): 'once' | 'per_playthrough' | 'per_player' | 'always' | undefined {
  const config = getWorldGenerationConfig(world);
  return config.defaultStrategy;
}

/**
 * Set default generation strategy in world config (immutable)
 *
 * @param world - Game world to update
 * @param strategy - Default generation strategy to set
 * @returns New world with updated strategy
 *
 * @example
 * ```ts
 * const newWorld = setWorldDefaultStrategy(world, 'per_playthrough');
 * ```
 */
export function setWorldDefaultStrategy(
  world: GameWorldDetail,
  strategy: 'once' | 'per_playthrough' | 'per_player' | 'always'
): GameWorldDetail {
  return updateWorldGenerationConfig(world, { defaultStrategy: strategy });
}

/**
 * Create default generation config
 *
 * Returns a default generation config with safe defaults.
 * Useful for initializing new worlds.
 *
 * @returns Default generation config
 *
 * @example
 * ```ts
 * const defaultConfig = createDefaultGenerationConfig();
 * // { maxContentRating: 'romantic', defaultStrategy: 'per_playthrough' }
 * ```
 */
export function createDefaultGenerationConfig(): WorldGenerationConfig {
  return {
    maxContentRating: 'romantic',
    defaultStrategy: 'per_playthrough',
  };
}

/**
 * Reset world generation config to defaults (immutable)
 *
 * @param world - Game world to reset
 * @returns New world with default generation config
 *
 * @example
 * ```ts
 * const newWorld = resetWorldGenerationConfig(world);
 * ```
 */
export function resetWorldGenerationConfig(world: GameWorldDetail): GameWorldDetail {
  return setWorldGenerationConfig(world, createDefaultGenerationConfig());
}
