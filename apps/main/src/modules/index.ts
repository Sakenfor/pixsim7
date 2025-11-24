/**
 * Module Registration
 *
 * This is where all application modules are imported and registered
 * with the module registry. Add new modules here as they're developed.
 */

import { moduleRegistry } from './types';
import { galleryModule } from './gallery';
import { pluginBootstrapModule } from './plugin-bootstrap';
import { graphSystemModule } from './graph-system';
import { gameSessionModule } from './game-session';
import { controlCenterModule } from './control-center';
import { assetsModule } from './assets';
import { workspaceModule } from './workspace';
import { generationModule } from './generation';
import { gameModule } from './game';
import { automationModule } from './automation';
import { pluginsModule } from './plugins';
import { appMapModule } from './app-map';
import {
  arcGraphModule,
  graphModule as graphPageModule,
  npcPortraitsModule,
  game2DModule,
  gizmoLabModule,
  interactionStudioModule,
  interactionDemoModule,
  healthModule,
  simulationModule,
  npcBrainLabModule,
  appMapModule as appMapPageModule,
  pluginWorkspaceModule,
  modulesDevModule,
} from './pages';

// Register all modules
export function registerModules() {
  // Infrastructure modules (priority: 100)
  // These must initialize first as other modules depend on them
  moduleRegistry.register(pluginBootstrapModule);

  // Core system modules (priority: 75)
  // Graph and session systems required by features
  moduleRegistry.register(graphSystemModule);
  moduleRegistry.register(gameSessionModule);

  // UI/Feature modules (priority: 50)
  // Standard feature modules that provide capabilities
  moduleRegistry.register(controlCenterModule);
  moduleRegistry.register(assetsModule);
  moduleRegistry.register(workspaceModule);
  moduleRegistry.register(generationModule);
  moduleRegistry.register(gameModule);
  moduleRegistry.register(automationModule);
  moduleRegistry.register(pluginsModule);
  moduleRegistry.register(appMapModule);

  // Legacy gallery module (kept for compatibility)
  moduleRegistry.register(galleryModule);

  // Page-only modules (no initialization logic, just navigation metadata)
  moduleRegistry.register(arcGraphModule);
  moduleRegistry.register(graphPageModule);
  moduleRegistry.register(npcPortraitsModule);
  moduleRegistry.register(game2DModule);
  moduleRegistry.register(gizmoLabModule);
  moduleRegistry.register(interactionStudioModule);
  moduleRegistry.register(interactionDemoModule);
  moduleRegistry.register(healthModule);
  moduleRegistry.register(simulationModule);
  moduleRegistry.register(npcBrainLabModule);
  moduleRegistry.register(appMapPageModule);
  moduleRegistry.register(pluginWorkspaceModule);
  moduleRegistry.register(modulesDevModule);

  // Note: sceneBuilderModule removed - now uses graphStore (Zustand) for state management
  // scene-builder module now only exports types
}

// Export registry for easy access
export { moduleRegistry };

// Export page category constants and types
export { PAGE_CATEGORIES, type PageCategory } from './types';

// Export module instances for direct access
export { galleryModule } from './gallery';
export { pluginBootstrapModule } from './plugin-bootstrap';
export { graphSystemModule } from './graph-system';
export { gameSessionModule } from './game-session';
export { controlCenterModule } from './control-center';
export { assetsModule } from './assets';
export { workspaceModule } from './workspace';
export { generationModule } from './generation';
export { gameModule } from './game';
export { automationModule } from './automation';
export { pluginsModule } from './plugins';
export { appMapModule } from './app-map';
