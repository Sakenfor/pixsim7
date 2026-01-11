/**
 * Prompt Companion Plugin Registration
 *
 * Registers the prompt companion toolbar with the slot system.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';
import { pluginCatalog } from '@lib/plugins/pluginSystem';
import { promptCompanionRegistry } from '@lib/ui';

import { PromptCompanionPanel } from './components/PromptCompanionPanel';
import { promptCompanionManifest } from './manifest';

/**
 * Register the Prompt Companion plugin
 *
 * Call this during app initialization to enable the prompt companion toolbar
 * across all supported prompt surfaces.
 */
export async function registerPromptCompanion(): Promise<() => void> {
  await registerPluginDefinition({
    id: promptCompanionManifest.id,
    family: 'ui-plugin',
    origin: 'builtin',
    source: 'source',
    plugin: {
      metadata: {
        ...promptCompanionManifest,
        family: 'ui-plugin',
      },
    },
    canDisable: promptCompanionManifest.canDisable,
    activationState: promptCompanionManifest.activationState,
  });

  // Register the companion panel with the slot system
  const unregister = promptCompanionRegistry.register({
    id: 'prompt-companion-panel',
    name: 'Prompt Companion',
    priority: 100, // High priority - render first
    component: PromptCompanionPanel,
    // Support all surfaces
    supportedSurfaces: ['prompt-lab', 'quick-generate', 'generation-workbench'],
    // Available in both dev and production (with graceful degradation)
    devOnly: false,
  });

  console.log('[PromptCompanion] Plugin registered');

  return () => {
    unregister();
    pluginCatalog.unregister(promptCompanionManifest.id);
    console.log('[PromptCompanion] Plugin unregistered');
  };
}
