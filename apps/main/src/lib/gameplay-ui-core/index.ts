/**
 * Gameplay UI Core
 *
 * HUD/gameplay-specific layer built on top of editing-core.
 * Provides HUD-specific config types and visibility conditions.
 */

export {
  toUnifiedSurfaceConfig,
  fromUnifiedSurfaceConfig,
  toHudToolPlacement,
  toHudToolPlacements,
  fromHudToolPlacement,
  fromHudToolPlacements,
} from './hudConfig';
export type {
  HudWidgetMeta,
  HudSurfaceMeta,
  HudWidgetConfig,
  HudSurfaceConfig,
} from './hudConfig';

export {
  evaluateHudVisibilityConditions,
  evaluateHudVisibility,
  toAdvancedVisibilityCondition,
  fromAdvancedVisibilityCondition,
  HudVisibilityHelpers,
} from './hudVisibility';
export type { HudVisibilityKind, HudVisibilityCondition } from './hudVisibility';
