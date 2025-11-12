/**
 * Module Registration
 *
 * This is where all application modules are imported and registered
 * with the module registry. Add new modules here as they're developed.
 */

import { moduleRegistry } from './types';
import { galleryModule } from './gallery';
import { sceneBuilderModule } from './scene-builder';

// Register all modules
export function registerModules() {
  moduleRegistry.register(galleryModule);
  moduleRegistry.register(sceneBuilderModule);

  // Future modules:
  // moduleRegistry.register(playbackModule);
  // moduleRegistry.register(collaborationModule);
  // etc.
}

// Export registry for easy access
export { moduleRegistry };

// Export module instances for direct access
export { galleryModule } from './gallery';
export { sceneBuilderModule } from './scene-builder';
