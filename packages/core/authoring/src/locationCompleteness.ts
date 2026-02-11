/**
 * Location Entity Schema
 *
 * Field-level location completeness.
 */

import { entity, field } from './entitySchema';
import type { EntitySchema } from './entitySchema';
import type { LocationAuthoringInput } from './types';

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

export function createLocationSchema(): EntitySchema<LocationAuthoringInput> {
  return entity<LocationAuthoringInput>('location', {
    // ---- Identity ---------------------------------------------------------
    name: field
      .string<LocationAuthoringInput>('Has a name', 'Location needs a name')
      .id('loc.hasName'),

    // ---- Background -------------------------------------------------------
    assetId: field
      .ref<LocationAuthoringInput>(
        'Has a background asset',
        'Assign a background image or 3D model so the location is visually represented',
      )
      .id('loc.hasBackground'),

    // ---- Hotspots ---------------------------------------------------------
    hotspots: field
      .array<LocationAuthoringInput>(
        'Has interactive hotspots',
        'Add at least one hotspot for player interaction',
      )
      .id('loc.hasHotspots'),

    orphanedHotspots: field
      .custom<LocationAuthoringInput>(
        'Hotspots without actions',
        (loc) => {
          const orphaned = (loc.hotspots ?? []).filter((h) => h.action == null).length;
          return orphaned > 0 ? false : 'skip';
        },
        (loc) => {
          const orphaned = (loc.hotspots ?? []).filter((h) => h.action == null).length;
          return `${orphaned} hotspot(s) have no action configured`;
        },
      )
      .warn()
      .id('loc.orphanedHotspots'),

    // ---- Navigation -------------------------------------------------------
    navigation: field
      .custom<LocationAuthoringInput>(
        'Has navigation to other locations',
        (loc) => (loc.hotspots ?? []).some((h) => h.action?.type === 'change_location'),
        'Add at least one hotspot that navigates to another location so the player can move around',
      )
      .id('loc.hasNavigation'),

    // ---- NPC slots (2D) ---------------------------------------------------
    hasNpcSlots: field
      .custom<LocationAuthoringInput>(
        'Has NPC placement slots',
        (loc) => ((loc.npcSlots2d?.length ?? 0) > 0 ? true : 'skip'),
      )
      .id('loc.hasNpcSlots'),

    noNpcSlots: field
      .custom<LocationAuthoringInput>(
        'No NPC placement slots',
        (loc) => ((loc.npcSlots2d?.length ?? 0) === 0 ? false : 'skip'),
        'Define NPC slots if this location should show NPCs in 2D view',
      )
      .warn()
      .id('loc.noNpcSlots'),
  });
}

// Shared singleton for simple use-cases.
export const locationSchema = createLocationSchema();
