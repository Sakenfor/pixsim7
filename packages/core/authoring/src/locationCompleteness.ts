/**
 * Location Completeness Checks — Built-in providers
 *
 * Each provider inspects one aspect of a location.
 * `registerBuiltinLocationChecks` adds them all to a registry.
 */

import type { CompletenessCheck, LocationAuthoringInput } from './types';
import type { CheckProvider, CompletenessRegistry } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(
  id: string,
  label: string,
  passes: boolean,
  detail?: string,
): CompletenessCheck {
  return {
    id,
    label,
    status: passes ? 'complete' : 'incomplete',
    detail: passes ? undefined : detail,
  };
}

function warn(
  id: string,
  label: string,
  detail: string,
): CompletenessCheck {
  return { id, label, status: 'warning', detail };
}

// ---------------------------------------------------------------------------
// Individual providers
// ---------------------------------------------------------------------------

export const checkLocationIdentity: CheckProvider<LocationAuthoringInput> = (loc) => [
  check('loc.hasName', 'Has a name', loc.name.trim().length > 0, 'Location needs a name'),
];

export const checkLocationBackground: CheckProvider<LocationAuthoringInput> = (loc) => [
  check(
    'loc.hasBackground',
    'Has a background asset',
    loc.assetId != null,
    'Assign a background image or 3D model so the location is visually represented',
  ),
];

export const checkLocationHotspots: CheckProvider<LocationAuthoringInput> = (loc) => {
  const checks: CompletenessCheck[] = [];
  const hotspots = loc.hotspots ?? [];

  checks.push(
    check(
      'loc.hasHotspots',
      'Has interactive hotspots',
      hotspots.length > 0,
      'Add at least one hotspot for player interaction',
    ),
  );

  const actionsWithoutType = hotspots.filter((h) => h.action == null);
  if (actionsWithoutType.length > 0) {
    checks.push(
      warn(
        'loc.orphanedHotspots',
        'Hotspots without actions',
        `${actionsWithoutType.length} hotspot(s) have no action configured`,
      ),
    );
  }

  return checks;
};

export const checkLocationNavigation: CheckProvider<LocationAuthoringInput> = (loc) => {
  const navHotspots = (loc.hotspots ?? []).filter((h) => h.action?.type === 'change_location');
  return [
    check(
      'loc.hasNavigation',
      'Has navigation to other locations',
      navHotspots.length > 0,
      'Add at least one hotspot that navigates to another location so the player can move around',
    ),
  ];
};

export const checkLocationNpcSlots: CheckProvider<LocationAuthoringInput> = (loc) => {
  const slotCount = loc.npcSlots2d?.length ?? 0;
  if (slotCount === 0) {
    return [
      warn(
        'loc.noNpcSlots',
        'No NPC placement slots',
        'Define NPC slots if this location should show NPCs in 2D view',
      ),
    ];
  }
  return [check('loc.hasNpcSlots', 'Has NPC placement slots', true)];
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register all built-in location check providers into a registry. */
export function registerBuiltinLocationChecks(registry: CompletenessRegistry): void {
  registry.register('location', 'core.identity', checkLocationIdentity);
  registry.register('location', 'core.background', checkLocationBackground);
  registry.register('location', 'core.hotspots', checkLocationHotspots);
  registry.register('location', 'core.navigation', checkLocationNavigation);
  registry.register('location', 'core.npcSlots', checkLocationNpcSlots);
}
