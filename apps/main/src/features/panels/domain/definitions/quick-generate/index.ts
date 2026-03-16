import { QuickGeneratePanel } from '@features/panels/components/helpers';

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
  consumesCapabilities: ['generation:scope'],
  showWhen: (context) => !!(context.currentAsset || context.currentSceneId),
  requiresContext: true,
  defaultSettings: {},
});
