import type {
  DisplaySpacesMap,
  DisplayTarget,
  GameWorldDisplayMeta,
  ResolvedDisplayTarget,
  DisplaySurfaceConfig,
  DisplaySpaceDefinition
} from '../../types';
import type { GameWorldMeta } from '../../types/game';

/**
 * Extracts the display spaces map from a GameWorld meta object, if present.
 */
export function getDisplaySpacesFromWorldMeta(
  meta: GameWorldMeta | null | undefined
): DisplaySpacesMap | undefined {
  const display = (meta?.display ?? null) as GameWorldDisplayMeta | null;
  return display?.spaces ?? undefined;
}

/**
 * Resolves a DisplayTarget against the spaces defined in GameWorld.meta.display.spaces.
 *
 * Returns null if:
 * - world meta is missing,
 * - target is missing,
 * - spaceId is not set or not found,
 * - surfaceId is set but not found.
 */
export function resolveDisplayTargetFromWorldMeta(
  meta: GameWorldMeta | null | undefined,
  target: DisplayTarget | null | undefined
): ResolvedDisplayTarget | null {
  if (!meta || !target || !target.spaceId) {
    return null;
  }

  const spaces = getDisplaySpacesFromWorldMeta(meta);
  if (!spaces) {
    return null;
  }

  const space: DisplaySpaceDefinition | undefined = spaces[target.spaceId];
  if (!space) {
    return null;
  }

  let surface: DisplaySurfaceConfig | undefined;
  if (target.surfaceId && space.surfaces && space.surfaces.length > 0) {
    surface = space.surfaces.find((s) => s.id === target.surfaceId);
    if (!surface) {
      // If the specific surface is not found, treat resolution as failed.
      return null;
    }
  }

  return { space, surface, target };
}

