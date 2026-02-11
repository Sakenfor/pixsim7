/**
 * Location Completeness Checks
 *
 * Evaluates how "ready for play" a location is by checking for
 * required authoring data: background asset, hotspots, navigation, NPC slots.
 */

import type {
  CompletenessCheck,
  EntityCompleteness,
  LocationAuthoringInput,
} from './types';

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

/**
 * Run all completeness checks for a single location.
 */
export function checkLocationCompleteness(loc: LocationAuthoringInput): EntityCompleteness {
  const checks: CompletenessCheck[] = [];

  // --- Identity ---
  checks.push(
    check('loc.hasName', 'Has a name', loc.name.trim().length > 0, 'Location needs a name'),
  );

  // --- Background ---
  checks.push(
    check(
      'loc.hasBackground',
      'Has a background asset',
      loc.assetId != null,
      'Assign a background image or 3D model so the location is visually represented',
    ),
  );

  // --- Hotspots ---
  const hotspots = loc.hotspots ?? [];
  checks.push(
    check(
      'loc.hasHotspots',
      'Has interactive hotspots',
      hotspots.length > 0,
      'Add at least one hotspot for player interaction',
    ),
  );

  // --- Navigation ---
  const navHotspots = hotspots.filter((h) => h.action?.type === 'change_location');
  checks.push(
    check(
      'loc.hasNavigation',
      'Has navigation to other locations',
      navHotspots.length > 0,
      'Add at least one hotspot that navigates to another location so the player can move around',
    ),
  );

  // --- NPC slots (2D) ---
  const slotCount = loc.npcSlots2d?.length ?? 0;
  if (slotCount === 0) {
    // Only warn — not all games use 2D NPC slots
    checks.push(
      warn(
        'loc.noNpcSlots',
        'No NPC placement slots',
        'Define NPC slots if this location should show NPCs in 2D view',
      ),
    );
  } else {
    checks.push(
      check('loc.hasNpcSlots', 'Has NPC placement slots', true),
    );
  }

  // --- Hotspot validity ---
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

  const passed = checks.filter((c) => c.status === 'complete').length;
  const total = checks.length;

  return {
    entityType: 'location',
    entityId: loc.id,
    entityName: loc.name,
    checks,
    score: total === 0 ? 1 : passed / total,
  };
}

/**
 * Run completeness checks for a batch of locations.
 */
export function checkLocationBatchCompleteness(
  locations: LocationAuthoringInput[],
): EntityCompleteness[] {
  return locations.map(checkLocationCompleteness);
}
