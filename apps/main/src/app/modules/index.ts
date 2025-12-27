/**
 * Module Registration
 *
 * This is where all application modules are imported and registered
 * with the module registry. Add new modules here as they're developed.
 */

import { moduleRegistry } from './types';
import { galleryModule } from '@features/gallery/module';
import { pluginBootstrapModule } from './core/pluginBootstrapModule';
import { graphSystemModule } from '@features/graph/systemModule';
import { gameSessionModule } from './core/gameSessionModule';
import { controlCenterModule } from '@features/controlCenter/module';
import { assetsModule } from '@features/assets/module';
import { workspaceModule } from '@features/workspace';
import { generationModule } from '@features/generation/module';
import { gameModule } from '@features/worldTools/module';
import { automationModule } from '@features/automation/module';
import { pluginsModule } from '@features/plugins/module';
import { appMapModule } from '@features/devtools/module';
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
  overlayConfigModule,
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
  moduleRegistry.register(overlayConfigModule);

  // Note: sceneBuilder now lives under @domain/sceneBuilder (no module init).
}

// Export registry for easy access
export { moduleRegistry };

// Export page category constants and types
export { PAGE_CATEGORIES, type PageCategory } from './types';

// Export module instances for direct access
export { galleryModule } from '@features/gallery/module';
export { pluginBootstrapModule } from './core/pluginBootstrapModule';
export { graphSystemModule } from '@features/graph/systemModule';
export { gameSessionModule } from './core/gameSessionModule';
export { controlCenterModule } from '@features/controlCenter/module';
export { assetsModule } from '@features/assets/module';
export { workspaceModule } from '@features/workspace';
export { generationModule } from '@features/generation/module';
export { gameModule } from '@features/worldTools/module';
export { automationModule } from '@features/automation/module';
export { pluginsModule } from '@features/plugins/module';
export { appMapModule } from '@features/devtools/module';
