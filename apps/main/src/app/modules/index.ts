// Module Registration
// Core and page modules are registered manually.
// Feature modules are auto-discovered from features/[name]/module.ts

import { autoRegisterAuthoringProjectBundleContributors } from '@lib/game/projectBundle';

import { registerDiscoveredFeatureModules } from './autoDiscover';

// Core modules (must be manually imported - not in features/)
import { gameSessionModule } from './core/gameSessionModule';
import { pluginBootstrapModule } from './core/pluginBootstrapModule';

// Page modules (navigation metadata only)
// Note: npcs module now auto-discovered via features/npcs/module.ts
import {
  arcGraphModule,
  graphModule as graphPageModule,
  game2DModule,
  gizmoLabModule,
  interactionStudioModule,
  interactionDemoModule,
  healthModule,
  simulationModule,
  npcBrainLabModule,
  appMapModule as appMapPageModule,
  pluginManagerModule,
  pluginWorkspaceModule,
  modulesDevModule,
  overlayConfigModule,
  assetDetailModule,
  generationPageModule,
  templateAnalyticsModule,
  promptInspectorModule,
  promptImporterModule,
  promptLabModule,
  actionBlockGraphModule,
  blockFitModule,
  widgetBuilderModule,
  mediaHarnessModule,
  routineGraphPageModule,
} from './pages';
import { moduleRegistry } from './registry';

// Register all modules
export function registerModules() {
  // Infrastructure modules (priority: 100)
  // These must initialize first as other modules depend on them
  moduleRegistry.register(pluginBootstrapModule);

  // Core system modules (priority: 75)
  // Session systems required by features
  moduleRegistry.register(gameSessionModule);

  // Feature modules (priority: 50-75) - AUTO-DISCOVERED
  // Any features/*/module.ts is automatically picked up
  registerDiscoveredFeatureModules();

  // Authoring contributors (project bundle extensions) are auto-discovered
  // from features/*/projectBundle/* and registered once at startup.
  autoRegisterAuthoringProjectBundleContributors();

  // Page-only modules (no initialization logic, just navigation metadata)
  // Note: npcs module now auto-discovered via features/npcs/module.ts
  moduleRegistry.register(arcGraphModule);
  moduleRegistry.register(graphPageModule);
  moduleRegistry.register(game2DModule);
  moduleRegistry.register(gizmoLabModule);
  moduleRegistry.register(interactionStudioModule);
  moduleRegistry.register(interactionDemoModule);
  moduleRegistry.register(healthModule);
  moduleRegistry.register(simulationModule);
  moduleRegistry.register(npcBrainLabModule);
  moduleRegistry.register(appMapPageModule);
  moduleRegistry.register(assetDetailModule);
  moduleRegistry.register(generationPageModule);
  moduleRegistry.register(pluginManagerModule);
  moduleRegistry.register(pluginWorkspaceModule);
  moduleRegistry.register(modulesDevModule);
  moduleRegistry.register(overlayConfigModule);
  moduleRegistry.register(templateAnalyticsModule);
  moduleRegistry.register(promptInspectorModule);
  moduleRegistry.register(promptImporterModule);
  moduleRegistry.register(promptLabModule);
  moduleRegistry.register(actionBlockGraphModule);
  moduleRegistry.register(blockFitModule);
  moduleRegistry.register(widgetBuilderModule);
  moduleRegistry.register(mediaHarnessModule);
  moduleRegistry.register(routineGraphPageModule);
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
export { PAGE_CATEGORIES, type PageCategory } from './contracts';

// Export core module instances for direct access
export { pluginBootstrapModule } from './core/pluginBootstrapModule';
export { gameSessionModule } from './core/gameSessionModule';

// Note: Feature modules are auto-discovered and can be accessed via:
// - moduleRegistry.get('module-id')
// - getDiscoveredFeatureModules()
