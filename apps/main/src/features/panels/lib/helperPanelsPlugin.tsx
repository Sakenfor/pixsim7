/**
 * Helper Panels Plugin
 *
 * Registers global context-aware helper panels that can be used across
 * different parts of the application (asset viewer, control center, etc.)
 */

import { QuickGeneratePanel, InfoPanel } from '../components/helpers';
import type { PanelPlugin } from './panelPlugin';

export const helperPanelsPlugin: PanelPlugin = {
  id: 'helper-panels',
  name: 'Global Helper Panels',
  version: '1.0.0',
  description: 'Context-aware helper panels (Quick Generate, Info)',

  panels: [
    // Quick Generate Panel - Context-aware generation panel
    {
      id: 'quickGenerate',
      title: 'Quick Generate',
      component: QuickGeneratePanel,
      category: 'tools',
      tags: ['generation', 'helper', 'context-aware'],
      icon: '✨',
      description: 'Quick generation panel that adapts to current context (asset or scene)',

      // Show when there's an asset or scene context
      showWhen: (context) => {
        return !!(context.currentAsset || context.currentSceneId);
      },
      requiresContext: true,

      // Settings (none for now, inherits from generation settings)
      defaultSettings: {},
    },

    // Info Panel - Context-aware information panel
    {
      id: 'info',
      title: 'Info',
      component: InfoPanel,
      category: 'tools',
      tags: ['metadata', 'info', 'helper', 'context-aware'],
      icon: 'ℹ️',
      description: 'Information panel that shows metadata for the current context',

      // Show when there's an asset or scene context
      showWhen: (context) => {
        return !!(context.currentAsset || context.currentSceneId);
      },
      requiresContext: true,

      // Settings (none for now)
      defaultSettings: {},
    },
  ],

  initialize() {
    console.log('[HelperPanelsPlugin] Initialized global helper panels: quickGenerate, info');
  },

  cleanup() {
    console.log('[HelperPanelsPlugin] Cleaned up helper panels');
  },
};
