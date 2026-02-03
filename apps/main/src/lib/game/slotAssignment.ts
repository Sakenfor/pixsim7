/**
 * Slot Assignment Utilities
 *
 * Re-exports from @pixsim7/game.engine for backward compatibility.
 * New code should import directly from @pixsim7/game.engine.
 *
 * @deprecated Import from '@pixsim7/game.engine' instead
 */

export {
  getNpcRoles,
  assignNpcsToSlots,
  getUnassignedNpcs,
} from '@pixsim7/game.engine';

export type { NpcSlotAssignment, NpcRoleMap } from '@pixsim7/game.engine';
