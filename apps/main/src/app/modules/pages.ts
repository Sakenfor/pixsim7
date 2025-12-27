/**
 * Page Module Aggregator
 *
 * Re-exports feature-owned page modules for app registration.
 */

export { arcGraphModule, graphModule } from '@features/graph/pages';
export { npcPortraitsModule } from '@features/npcs/pages';
export { game2DModule, simulationModule } from '@features/simulation/pages';
export { gizmoLabModule } from '@features/gizmos/pages';
export { interactionStudioModule, interactionDemoModule } from '@features/interactions/pages';
export { healthModule, appMapModule, modulesDevModule } from '@features/devtools/pages';
export { npcBrainLabModule } from '@features/brainTools/pages';
export { pluginWorkspaceModule } from '@features/plugins/pages';
export { overlayConfigModule } from '@features/componentSettings/pages';
