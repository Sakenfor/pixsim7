/**
 * Quick Generate Panel Registry
 *
 * Local panel registry for the quick generate module's dockview panels.
 * Defines: Asset, Prompt, Settings, Blocks panels.
 */

import { createLocalPanelRegistry } from '@lib/dockview';
import { AssetPanel, PromptPanel, SettingsPanel, BlocksPanel } from './QuickGeneratePanels';

/** Panel IDs for quick generate */
export type QuickGenPanelId = 'asset' | 'prompt' | 'settings' | 'blocks';

/** Create and configure the quick generate panel registry */
export function createQuickGenPanelRegistry() {
  const registry = createLocalPanelRegistry<QuickGenPanelId>();

  registry.registerAll([
    {
      id: 'asset',
      title: 'Asset',
      component: AssetPanel,
      icon: 'image',
      size: { minWidth: 120 },
    },
    {
      id: 'prompt',
      title: 'Prompt',
      component: PromptPanel,
      icon: 'edit',
      size: { minWidth: 200 },
    },
    {
      id: 'settings',
      title: 'Settings',
      component: SettingsPanel,
      icon: 'settings',
      size: { minWidth: 180 },
    },
    {
      id: 'blocks',
      title: 'Blocks',
      component: BlocksPanel,
      icon: 'grid',
      size: { minHeight: 80 },
    },
  ]);

  return registry;
}

/** Singleton registry instance */
export const quickGenPanelRegistry = createQuickGenPanelRegistry();
