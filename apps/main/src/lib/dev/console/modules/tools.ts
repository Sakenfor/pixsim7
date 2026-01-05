/**
 * Tools Console Module
 *
 * Thin wrapper that registers the tools manifest.
 * The gizmos feature owns its console commands.
 */

import { toolsManifest, registerConsoleManifest } from '../manifests';
import type { ConsoleModule } from '../moduleRegistry';

// Re-export the store for backwards compatibility
export { useToolConsoleStore } from '@/gizmos/console';

/**
 * Tools console module
 *
 * Registers tool and gizmo operations via manifest.
 * See manifests/tools.ts for the actual declarations.
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
