/**
 * Workspace Console Module
 *
 * Thin wrapper that registers the workspace manifest.
 * Provides workspace and selection operations.
 */

import { workspaceManifest } from '@features/workspace/lib/consoleManifest';

import { registerConsoleManifest } from '../manifests';
import type { ConsoleModule } from '../moduleRegistry';

/**
 * Workspace console module
 *
 * Registers workspace and selection operations via manifest.
 * See features/workspace/lib/consoleManifest.ts for the actual declarations.
 */
export const workspaceModule: ConsoleModule = {
  id: workspaceManifest.id,
  name: workspaceManifest.name,
  description: workspaceManifest.description,
  dependencies: workspaceManifest.dependencies,
  register: () => {
    registerConsoleManifest(workspaceManifest);
  },
};
