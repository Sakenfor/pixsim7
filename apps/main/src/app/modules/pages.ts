/**
 * Page Module Aggregator
 *
 * Re-exports feature-owned page modules for app registration.
 */

export { arcGraphModule, graphModule } from '@features/graph/routes';
// npcPortraitsModule removed - now auto-discovered via features/npcs/module.ts
export { game2DModule, simulationModule } from '@features/simulation/routes';
export { gizmoLabModule } from '@features/gizmos/routes';
export { interactionStudioModule, interactionDemoModule } from '@features/interactions/routes';
export {
  healthModule,
  codegenPageModule,
  promptImporterPageModule,
  blockFitPageModule,
} from '@features/devtools/routes';
export { npcBrainLabModule } from '@features/brainTools/routes';
export { pluginManagerModule } from '@features/plugins/routes';
export { overlayConfigModule } from '@features/componentSettings/routes';
export { assetDetailModule } from '@features/assets/routes';
export { generationPageModule } from '@features/generation/routes';
export { settingsPageModule } from '@features/settings/routes';
export { routineGraphPageModule } from '@features/routine-graph/routes';
