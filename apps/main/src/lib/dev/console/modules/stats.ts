/**
 * Stats Console Module
 *
 * Thin wrapper that registers the stats manifest.
 * Allows viewing, adjusting, and cheating stats for NPC interactions.
 */

import { statsManifest } from '@features/gizmos/lib/consoleStatsManifest';

import { registerConsoleManifest } from '../manifests';
import type { ConsoleModule } from '../moduleRegistry';

/**
 * Stats console module
 *
 * Registers stats operations via manifest.
 * See features/gizmos/lib/consoleStatsManifest.ts for the actual declarations.
 *
 * Note: The interactionStats data store is registered by the core module.
 */
export const statsModule: ConsoleModule = {
  id: statsManifest.id,
  name: statsManifest.name,
  description: statsManifest.description,
  dependencies: statsManifest.dependencies,
  register: () => {
    registerConsoleManifest(statsManifest);
  },
};
