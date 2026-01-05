/**
 * Core Console Module
 *
 * Thin wrapper that registers the core manifest.
 * This module should be loaded first as other modules may depend on it.
 */

import { coreManifest, registerConsoleManifest } from '../manifests';
import type { ConsoleModule } from '../moduleRegistry';

/**
 * Core console module
 *
 * Registers core data stores and console operations via manifest.
 * See manifests/core.ts for the actual declarations.
 */
export const coreModule: ConsoleModule = {
  id: coreManifest.id,
  name: coreManifest.name,
  description: coreManifest.description,
  dependencies: coreManifest.dependencies,
  register: () => {
    registerConsoleManifest(coreManifest);
  },
};
