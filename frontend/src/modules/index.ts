/**
 * Module Registration
 *
 * This is where all application modules are imported and registered
 * with the module registry. Add new modules here as they're developed.
 */

import { moduleRegistry } from './types';
import { galleryModule } from './gallery';
import { assetsModule } from './assets';
import { workspaceModule } from './workspace';
import { generationModule } from './generation';
import { gameModule } from './game';
import { automationModule } from './automation';
import { pluginsModule } from './plugins';

// Register all modules
export function registerModules() {
  // Legacy gallery module (kept for compatibility)
  moduleRegistry.register(galleryModule);

  // Core feature modules
  moduleRegistry.register(assetsModule);
  moduleRegistry.register(workspaceModule);
  moduleRegistry.register(generationModule);
  moduleRegistry.register(gameModule);
  moduleRegistry.register(automationModule);
  moduleRegistry.register(pluginsModule);

  // Note: sceneBuilderModule removed - now uses graphStore (Zustand) for state management
  // scene-builder module now only exports types

  // Future modules:
  // moduleRegistry.register(playbackModule);
  // moduleRegistry.register(collaborationModule);
  // etc.
}

// Export registry for easy access
export { moduleRegistry };

// Export module instances for direct access
export { galleryModule } from './gallery';
export { assetsModule } from './assets';
export { workspaceModule } from './workspace';
export { generationModule } from './generation';
export { gameModule } from './game';
export { automationModule } from './automation';
export { pluginsModule } from './plugins';
