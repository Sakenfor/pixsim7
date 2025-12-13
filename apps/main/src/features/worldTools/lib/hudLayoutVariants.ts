/**
 * HUD Layout Variants & Inheritance System
 *
 * Provides utilities for managing multiple named layouts per world
 * and inheriting layouts from presets.
 */

import type { HudToolPlacement, WorldUiConfig } from './types';
import type { GameWorldDetail } from '@lib/api/game';
import { getPreset } from './hudPresets';

/**
 * Get the active layout for a world
 * Considers inheritance and active layout variant
 */
export function getActiveLayout(worldDetail: GameWorldDetail): HudToolPlacement[] {
  if (!worldDetail.meta) return [];

  const ui = worldDetail.meta.ui as WorldUiConfig | undefined;
  if (!ui) return [];

  // Check if there's an active layout variant
  if (ui.activeLayout && ui.hudLayouts?.[ui.activeLayout]) {
    return ui.hudLayouts[ui.activeLayout];
  }

  // Check if using inheritance
  if (ui.inheritFrom) {
    return resolveInheritedLayout(ui);
  }

  // Return default layout
  return ui.hud || [];
}

/**
 * Resolve inherited layout by merging preset with overrides
 */
export function resolveInheritedLayout(ui: WorldUiConfig): HudToolPlacement[] {
  if (!ui.inheritFrom) return ui.hud || [];

  // Load base layout from preset
  const preset = getPreset(ui.inheritFrom);
  if (!preset) {
    console.warn(`Inherited preset not found: ${ui.inheritFrom}`);
    return ui.hud || [];
  }

  const basePlacements = preset.placements;
  const overrides = ui.overrides || [];

  // Create a map of tool ID to placement
  const placementMap = new Map<string, HudToolPlacement>();

  // Add base placements
  for (const placement of basePlacements) {
    placementMap.set(placement.toolId, placement);
  }

  // Apply overrides
  for (const override of overrides) {
    const existing = placementMap.get(override.toolId);
    if (existing) {
      // Merge override with existing placement
      placementMap.set(override.toolId, { ...existing, ...override });
    } else {
      // Add new tool
      placementMap.set(override.toolId, override);
    }
  }

  return Array.from(placementMap.values());
}

/**
 * Get all layout variant names for a world
 */
export function getLayoutVariantNames(worldDetail: GameWorldDetail): string[] {
  if (!worldDetail.meta) return [];

  const ui = worldDetail.meta.ui as WorldUiConfig | undefined;
  if (!ui?.hudLayouts) return [];

  return Object.keys(ui.hudLayouts);
}

/**
 * Get a specific layout variant by name
 */
export function getLayoutVariant(
  worldDetail: GameWorldDetail,
  variantName: string
): HudToolPlacement[] | null {
  if (!worldDetail.meta) return null;

  const ui = worldDetail.meta.ui as WorldUiConfig | undefined;
  return ui?.hudLayouts?.[variantName] || null;
}

/**
 * Set the active layout variant
 * Returns updated world metadata
 */
export function setActiveLayoutVariant(
  worldDetail: GameWorldDetail,
  variantName: string
): Record<string, unknown> {
  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...(worldDetail.meta?.ui as Record<string, unknown> | undefined),
      activeLayout: variantName,
    } as WorldUiConfig,
  };

  return updatedMeta;
}

/**
 * Create or update a layout variant
 * Returns updated world metadata
 */
export function saveLayoutVariant(
  worldDetail: GameWorldDetail,
  variantName: string,
  placements: HudToolPlacement[]
): Record<string, unknown> {
  const ui = (worldDetail.meta?.ui as WorldUiConfig) || {};
  const existingLayouts = ui.hudLayouts || {};

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      hudLayouts: {
        ...existingLayouts,
        [variantName]: placements,
      },
    } as WorldUiConfig,
  };

  return updatedMeta;
}

/**
 * Delete a layout variant
 * Returns updated world metadata
 */
export function deleteLayoutVariant(
  worldDetail: GameWorldDetail,
  variantName: string
): Record<string, unknown> {
  const ui = (worldDetail.meta?.ui as WorldUiConfig) || {};
  const existingLayouts = ui.hudLayouts || {};

  const { [variantName]: removed, ...remainingLayouts } = existingLayouts;

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      hudLayouts: remainingLayouts,
      // Clear active layout if it was the deleted one
      activeLayout: ui.activeLayout === variantName ? undefined : ui.activeLayout,
    } as WorldUiConfig,
  };

  return updatedMeta;
}

/**
 * Set layout inheritance from a preset
 * Returns updated world metadata
 */
export function setLayoutInheritance(
  worldDetail: GameWorldDetail,
  presetId: string | null,
  overrides?: HudToolPlacement[]
): Record<string, unknown> {
  const ui = (worldDetail.meta?.ui as WorldUiConfig) || {};

  if (!presetId) {
    // Clear inheritance
    const { inheritFrom, overrides: _, ...restUi } = ui;
    return {
      ...worldDetail.meta,
      ui: restUi,
    };
  }

  const updatedMeta: Record<string, unknown> = {
    ...worldDetail.meta,
    ui: {
      ...ui,
      inheritFrom: presetId,
      overrides: overrides || [],
    } as WorldUiConfig,
  };

  return updatedMeta;
}

/**
 * Compute diff between two layouts
 * Returns tools that differ between base and current
 */
export function computeLayoutDiff(
  basePlacements: HudToolPlacement[],
  currentPlacements: HudToolPlacement[]
): HudToolPlacement[] {
  const baseMap = new Map(basePlacements.map(p => [p.toolId, p]));
  const diff: HudToolPlacement[] = [];

  for (const current of currentPlacements) {
    const base = baseMap.get(current.toolId);

    if (!base) {
      // New tool not in base
      diff.push(current);
    } else if (JSON.stringify(base) !== JSON.stringify(current)) {
      // Tool exists but has different configuration
      diff.push(current);
    }
  }

  return diff;
}

/**
 * Switch to a different layout variant with animation/transition
 * This can be used for runtime layout switching
 */
export function switchLayoutVariant(
  worldDetail: GameWorldDetail,
  variantName: string,
  onUpdate: (meta: Record<string, unknown>) => void
): void {
  const updatedMeta = setActiveLayoutVariant(worldDetail, variantName);
  onUpdate(updatedMeta);
}
