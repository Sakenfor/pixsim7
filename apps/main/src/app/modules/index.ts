// Module Registration
// Core and page modules are registered manually.
// Feature modules are auto-discovered from features/[name]/module.ts

import { moduleRegistry } from './types';
import { registerDiscoveredFeatureModules } from './autoDiscover';

// Core modules (must be manually imported - not in features/)
import { pluginBootstrapModule } from './core/pluginBootstrapModule';
import { graphSystemModule } from '@features/graph/systemModule';
import { gameSessionModule } from './core/gameSessionModule';

// Page modules (navigation metadata only)
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

  // Feature modules (priority: 50-70) - AUTO-DISCOVERED
  // Any features/*/module.ts is automatically picked up
  registerDiscoveredFeatureModules();

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
}

// Export registry for easy access
export { moduleRegistry };

// Export auto-discovery utilities
export {
  registerDiscoveredFeatureModules,
  getDiscoveredFeatureModules,
  getDiscoveredFeatureModuleIds,
} from './autoDiscover';

// Export page category constants and types
export { PAGE_CATEGORIES, type PageCategory } from './types';

// Export core module instances for direct access
export { pluginBootstrapModule } from './core/pluginBootstrapModule';
export { graphSystemModule } from '@features/graph/systemModule';
export { gameSessionModule } from './core/gameSessionModule';

// Note: Feature modules are auto-discovered and can be accessed via:
// - moduleRegistry.get('module-id')
// - getDiscoveredFeatureModules()
