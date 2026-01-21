/**
 * World Tool Context Types
 *
 * Re-exports from shared package with app-specific type specialization.
 */

import type { NpcSlotAssignment } from '@pixsim7/game.engine';
import type { ViewMode } from '@pixsim7/shared.types';
import type { WorldToolContext as SharedWorldToolContext } from '@pixsim7/shared.ui.tools';

// Re-export WorldTime from shared package
export type { WorldTime } from '@pixsim7/shared.ui.tools';

/**
 * World tool context available to plugins.
 * Specialized with app's NpcSlotAssignment type.
 */
export type WorldToolContext = SharedWorldToolContext<NpcSlotAssignment> & {
  viewMode?: ViewMode;
};
