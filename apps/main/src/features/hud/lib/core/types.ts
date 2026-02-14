/**
 * HUD Layout Types
 *
 * Part of Task 58 Phase 58.1 - HUD Layout Types & Store
 *
 * Defines types for HUD layouts that reuse panel composition structures.
 * HUDs are built using the same widget system as custom panels (Task 50).
 */

import type { PanelComposition } from '@pixsim7/core.panel-composer';

/**
 * HUD region identifiers
 * Defines the standard overlay regions in game view
 */
export type HudRegionId = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * HUD region layout
 * Each region contains a panel composition with widgets
 */
export interface HudRegionLayout {
  region: HudRegionId;
  composition: PanelComposition;
  enabled?: boolean; // Allow disabling specific regions
  zIndex?: number; // Layer ordering for overlapping regions
  styles?: React.CSSProperties; // Region-specific styling
}

/**
 * Complete HUD layout for a world
 * Defines all HUD regions and their widget compositions
 */
export interface WorldHudLayout {
  id: string;
  worldId: number | string;
  name: string;
  description?: string;
  regions: HudRegionLayout[];
  isDefault?: boolean; // Whether this is the default HUD for the world
  version?: string; // Schema version for migrations
  createdAt?: number;
  updatedAt?: number;
}

/**
 * HUD preset definition
 * Reusable HUD configurations
 */
export interface HudPreset {
  id: string;
  name: string;
  description: string;
  category: 'story' | 'debug' | 'playtest' | 'custom';
  layout: Omit<WorldHudLayout, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>;
  icon?: string;
}

/**
 * HUD region positioning configuration
 * Controls how regions are positioned in the game viewport
 */
export interface HudRegionPosition {
  region: HudRegionId;
  anchor: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  offset?: { x: number; y: number };
  maxWidth?: string;
  maxHeight?: string;
}

/**
 * Default HUD region positions
 */
export const DEFAULT_REGION_POSITIONS: Record<HudRegionId, HudRegionPosition> = {
  top: {
    region: 'top',
    anchor: 'top-center',
    maxHeight: '25%',
  },
  bottom: {
    region: 'bottom',
    anchor: 'bottom-center',
    maxHeight: '25%',
  },
  left: {
    region: 'left',
    anchor: 'center-left',
    maxWidth: '25%',
  },
  right: {
    region: 'right',
    anchor: 'center-right',
    maxWidth: '25%',
  },
  center: {
    region: 'center',
    anchor: 'center',
    maxWidth: '50%',
    maxHeight: '50%',
  },
};

/**
 * Validate a HUD region layout
 */
export function validateHudRegion(region: HudRegionLayout): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!region.region) {
    errors.push('Region must have a region ID');
  }

  if (!region.composition) {
    errors.push('Region must have a composition');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a complete HUD layout
 */
export function validateHudLayout(layout: WorldHudLayout): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!layout.id) {
    errors.push('HUD layout must have an ID');
  }

  if (!layout.worldId && layout.worldId !== 0) {
    errors.push('HUD layout must have a worldId');
  }

  if (!layout.name) {
    errors.push('HUD layout must have a name');
  }

  // Validate each region
  for (const region of layout.regions) {
    const regionValidation = validateHudRegion(region);
    if (!regionValidation.valid) {
      errors.push(...regionValidation.errors.map((e) => `Region ${region.region}: ${e}`));
    }
  }

  // Check for duplicate regions
  const regionIds = layout.regions.map((r) => r.region);
  const duplicates = regionIds.filter((id, index) => regionIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    errors.push(`Duplicate regions found: ${duplicates.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
