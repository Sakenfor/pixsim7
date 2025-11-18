/**
 * World Manifest Configuration
 *
 * Utilities for reading and writing world manifest configuration
 * stored in GameWorld.meta.
 */

import type { GameWorldDetail, WorldManifest } from '@pixsim7/types';
import { TURN_DELTAS, type TurnDeltaPreset } from './turnPresets';

/**
 * Get the world manifest from GameWorld.meta
 * Returns empty object if no manifest is configured
 */
export function getWorldManifest(world: GameWorldDetail): WorldManifest {
  if (!world.meta) {
    return {};
  }
  // The manifest is stored in the meta object
  return (world.meta as WorldManifest) || {};
}

/**
 * Set/update the world manifest in GameWorld.meta
 * Returns a new GameWorldDetail with updated manifest
 */
export function setWorldManifest(
  world: GameWorldDetail,
  manifest: WorldManifest
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...manifest,
    },
  };
}

/**
 * Update specific manifest properties while preserving others
 * Returns a new GameWorldDetail with merged manifest
 */
export function updateWorldManifest(
  world: GameWorldDetail,
  updates: Partial<WorldManifest>
): GameWorldDetail {
  const currentManifest = getWorldManifest(world);
  return setWorldManifest(world, {
    ...currentManifest,
    ...updates,
  });
}

/**
 * Get the turn preset name from the manifest
 * Returns undefined if not set
 */
export function getManifestTurnPreset(world: GameWorldDetail): string | undefined {
  const manifest = getWorldManifest(world);
  return manifest.turn_preset;
}

/**
 * Get turn delta seconds from manifest turn preset
 * Falls back to default (ONE_HOUR = 3600) if not set or invalid
 */
export function getManifestTurnDelta(world: GameWorldDetail): number {
  const presetName = getManifestTurnPreset(world);
  if (!presetName) {
    return TURN_DELTAS.ONE_HOUR; // Default
  }

  // Check if it's a valid preset name
  const preset = presetName as TurnDeltaPreset;
  if (preset in TURN_DELTAS) {
    return TURN_DELTAS[preset];
  }

  // Invalid preset, fall back to default
  return TURN_DELTAS.ONE_HOUR;
}

/**
 * Set the turn preset in the manifest
 * Returns a new GameWorldDetail with updated preset
 */
export function setManifestTurnPreset(
  world: GameWorldDetail,
  preset: TurnDeltaPreset
): GameWorldDetail {
  return updateWorldManifest(world, {
    turn_preset: preset,
  });
}

/**
 * Get enabled arc graph IDs from the manifest
 * Returns empty array if not set
 */
export function getManifestEnabledArcGraphs(world: GameWorldDetail): string[] {
  const manifest = getWorldManifest(world);
  return manifest.enabled_arc_graphs || [];
}

/**
 * Set enabled arc graph IDs in the manifest
 * Returns a new GameWorldDetail with updated arc graphs
 */
export function setManifestEnabledArcGraphs(
  world: GameWorldDetail,
  arcGraphIds: string[]
): GameWorldDetail {
  return updateWorldManifest(world, {
    enabled_arc_graphs: arcGraphIds,
  });
}

/**
 * Check if an arc graph is enabled in this world
 */
export function isArcGraphEnabled(world: GameWorldDetail, arcGraphId: string): boolean {
  const enabledGraphs = getManifestEnabledArcGraphs(world);
  return enabledGraphs.includes(arcGraphId);
}

/**
 * Get enabled plugin IDs from the manifest
 * Returns empty array if not set
 */
export function getManifestEnabledPlugins(world: GameWorldDetail): string[] {
  const manifest = getWorldManifest(world);
  return manifest.enabled_plugins || [];
}

/**
 * Set enabled plugin IDs in the manifest
 * Returns a new GameWorldDetail with updated plugins
 */
export function setManifestEnabledPlugins(
  world: GameWorldDetail,
  pluginIds: string[]
): GameWorldDetail {
  return updateWorldManifest(world, {
    enabled_plugins: pluginIds,
  });
}

/**
 * Check if a plugin is enabled in this world
 */
export function isPluginEnabled(world: GameWorldDetail, pluginId: string): boolean {
  const enabledPlugins = getManifestEnabledPlugins(world);
  return enabledPlugins.includes(pluginId);
}

/**
 * Create a default world manifest with common defaults
 */
export function createDefaultManifest(): WorldManifest {
  return {
    turn_preset: 'ONE_HOUR',
    enabled_arc_graphs: [],
    enabled_plugins: [],
  };
}
