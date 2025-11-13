/**
 * Module Registration
 *
 * This is where all application modules are imported and registered
 * with the module registry. Add new modules here as they're developed.
 */

import { moduleRegistry } from './types';
import { galleryModule } from './gallery';

// Register all modules
export function registerModules() {
  moduleRegistry.register(galleryModule);

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
