import { assignNpcsToSlots, type NpcSlotAssignment } from '@pixsim7/game.engine';
import { useMemo } from 'react';


import {
  getNpcSlots,
  getWorldNpcRoles,
  type GameLocationDetail,
  type GameWorldDetail,
  type NpcPresenceDTO,
} from '@lib/api';

/**
 * Derives slot assignments for the given location. Pure mapping over
 * (locationDetail, locationNpcs, worldDetail) — returns an empty list when
 * there is no location or the location defines no slots.
 *
 * Replaces an inline useState + useEffect pair so callers get derived state
 * computed during render rather than after-commit, eliminating the
 * intermediate empty-array flash on input changes.
 */
export function useNpcSlotAssignments(
  locationDetail: GameLocationDetail | null,
  locationNpcs: NpcPresenceDTO[],
  worldDetail: GameWorldDetail | null,
): NpcSlotAssignment[] {
  return useMemo(() => {
    if (!locationDetail) return [];
    const slots = getNpcSlots(locationDetail);
    if (slots.length === 0) return [];
    const npcRoles = worldDetail ? getWorldNpcRoles(worldDetail) : {};
    return assignNpcsToSlots(slots, locationNpcs, npcRoles);
  }, [locationDetail, locationNpcs, worldDetail]);
}
