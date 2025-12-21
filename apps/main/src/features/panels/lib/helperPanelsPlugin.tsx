/**
 * Helper Panels Plugin
 *
 * Registers global context-aware helper panels that can be used across
 * different parts of the application (asset viewer, control center, etc.)
 */

import { QuickGeneratePanel, InfoPanel } from '../components/helpers';
// Note: InteractiveSurfacePanel is now auto-discovered from definitions/
import {
  AssetPanel as QuickGenAssetPanel,
  PromptPanel as QuickGenPromptPanel,
  SettingsPanel as QuickGenSettingsPanel,
  BlocksPanel as QuickGenBlocksPanel,
} from '@features/controlCenter/components/QuickGeneratePanels';
import {
  QUICKGEN_PROMPT_COMPONENT_ID,
  QUICKGEN_SETTINGS_COMPONENT_ID,
} from '@features/controlCenter/lib/quickGenerateComponentSettings';
import { MediaPanel } from '@/components/media/viewer/panels/MediaPanel';
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
      icon: 'sparkles',
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
      icon: 'info',
      description: 'Information panel that shows metadata for the current context',

      // Show when there's an asset or scene context
      showWhen: (context) => {
        return !!(context.currentAsset || context.currentSceneId);
      },
      requiresContext: true,

      // Settings (none for now)
      defaultSettings: {},
    },

    // Quick Generate Modules - building blocks for custom workflows
    {
      id: 'quickgen-asset',
      title: 'QuickGen Asset',
      component: QuickGenAssetPanel,
      category: 'tools',
      tags: ['generation', 'queue', 'asset', 'quickgen'],
      icon: 'image',
      description: 'Asset input panel for quick generation workflows',
      supportsCompactMode: true,
      supportsMultipleInstances: false,
    },
    {
      id: 'quickgen-prompt',
      title: 'QuickGen Prompt',
      component: QuickGenPromptPanel,
      category: 'tools',
      tags: ['generation', 'prompt', 'quickgen'],
      icon: 'edit',
      description: 'Prompt editor for quick generation workflows',
      componentSettings: [QUICKGEN_PROMPT_COMPONENT_ID],
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'quickgen-settings',
      title: 'QuickGen Settings',
      component: QuickGenSettingsPanel,
      category: 'tools',
      tags: ['generation', 'settings', 'quickgen'],
      icon: 'settings',
      description: 'Generation settings and Go button for quick workflows',
      componentSettings: [QUICKGEN_SETTINGS_COMPONENT_ID],
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'quickgen-blocks',
      title: 'QuickGen Blocks',
      component: QuickGenBlocksPanel,
      category: 'tools',
      tags: ['generation', 'prompt', 'blocks', 'quickgen'],
      icon: 'grid',
      description: 'Prompt companion blocks for quick generation',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },

    // Media Preview - lightweight viewer panel
    {
      id: 'media-preview',
      title: 'Media Preview',
      component: MediaPanel,
      category: 'workspace',
      tags: ['media', 'preview', 'viewer'],
      icon: 'image',
      description: 'Lightweight media preview panel for selected assets',
      supportsCompactMode: false,
      supportsMultipleInstances: true,
    },

    // Note: interactive-surface panel is now auto-discovered from definitions/
  ],

  initialize() {
    console.log('[HelperPanelsPlugin] Initialized global helper panels: quickGenerate, info');
  },

  cleanup() {
    console.log('[HelperPanelsPlugin] Cleaned up helper panels');
  },
};
