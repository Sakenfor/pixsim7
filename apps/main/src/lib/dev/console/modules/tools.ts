/**
 * Tools Console Module
 *
 * Thin wrapper that registers the tools manifest.
 * The gizmos feature owns its console commands.
 */

import { toolsManifest } from '@features/gizmos/lib/consoleToolsManifest';

import { registerConsoleManifest } from '../manifests';
import type { ConsoleModule } from '../moduleRegistry';

// Re-export the store for backwards compatibility
export { useToolConsoleStore } from '@features/gizmos/lib/core/console';

/**
 * Tools console module
 *
 * Registers tool and gizmo operations via manifest.
 * See features/gizmos/lib/consoleToolsManifest.ts for the actual declarations.
 */
export const toolsModule: ConsoleModule = {
  id: toolsManifest.id,
  name: toolsManifest.name,
  description: toolsManifest.description,
  dependencies: toolsManifest.dependencies,
  register: () => {
    registerConsoleManifest(toolsManifest);
  },
};
