/**
 * Page Module Aggregator
 *
 * Re-exports feature-owned page modules for app registration.
 */

export { arcGraphModule, graphModule } from '@features/graph/routes';
export { npcPortraitsModule } from '@features/npcs/routes';
export { game2DModule, simulationModule } from '@features/simulation/routes';
export { gizmoLabModule } from '@features/gizmos/routes';
export { interactionStudioModule, interactionDemoModule } from '@features/interactions/routes';
export { healthModule, appMapModule, modulesDevModule } from '@features/devtools/routes';
export { npcBrainLabModule } from '@features/brainTools/routes';
export { pluginManagerModule, pluginWorkspaceModule } from '@features/plugins/routes';
export { overlayConfigModule } from '@features/componentSettings/routes';
export { assetDetailModule } from '@features/assets/routes';
export { generationPageModule } from '@features/generation/routes';
