/**
 * World Tool Context Types
 *
 * Separated from types.ts to avoid circular dependencies with gameplay-ui-core.
 */

import type {
  GameSessionDTO,
  GameWorldDetail,
  GameLocationDetail,
  NpcPresenceDTO,
} from '../api/game';
import type { NpcSlotAssignment } from '@pixsim7/game.engine';

/**
 * World time representation
 */
export interface WorldTime {
  day: number;
  hour: number;
}

/**
 * World tool context available to plugins
 */
export interface WorldToolContext {
  /** Current game session (may be null if no session created yet) */
  session: GameSessionDTO | null;

  /** Session flags for gameplay customization */
  sessionFlags: Record<string, unknown>;

  /** NPC relationships state */
  relationships: Record<string, unknown>;

  /** Current world detail */
  worldDetail: GameWorldDetail | null;

  /** Current world time */
  worldTime: WorldTime;

  /** Current location detail */
  locationDetail: GameLocationDetail | null;

  /** NPCs present at current location */
  locationNpcs: NpcPresenceDTO[];

  /** NPC slot assignments for current location */
  npcSlotAssignments: NpcSlotAssignment[];

  /** Selected world ID */
  selectedWorldId: number | null;

  /** Selected location ID */
  selectedLocationId: number | null;

  /** Active NPC ID */
  activeNpcId: number | null;
}
