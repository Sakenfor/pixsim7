import { QuickGeneratePanel } from './QuickGeneratePanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'quickGenerate',
  title: 'Quick Generate',
  component: QuickGeneratePanel,
  category: 'generation',
  tags: ['generation', 'helper', 'context-aware'],
  icon: 'sparkles',
  description: 'Quick generation panel that adapts to current context (asset or scene)',
  availableIn: ['asset-viewer'],
  // NOTE: Do NOT add consumesCapabilities: ['generation:scope'] here.
  // QuickGenWidget inside this panel manages its own GenerationScopeProvider.
  // Adding generation:scope causes ScopeHost to double-wrap, creating a
  // competing scope (assetViewer:quickGenerate vs viewerQuickGenerate:*)
  // that breaks mask/input routing.
  showWhen: (context) => !!(context.currentAsset || context.currentSceneId),
  requiresContext: true,
  defaultSettings: {},
});
