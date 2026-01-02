import { definePanel } from '../../../lib/definePanel';
import { QuickGeneratePanel } from '@features/panels/components/helpers';

export default definePanel({
  id: 'quickGenerate',
  title: 'Quick Generate',
  component: QuickGeneratePanel,
  category: 'generation',
  tags: ['generation', 'helper', 'context-aware'],
  icon: 'sparkles',
  description: 'Quick generation panel that adapts to current context (asset or scene)',
  availableIn: ['asset-viewer'],
  settingScopes: ['generation'],
  showWhen: (context) => !!(context.currentAsset || context.currentSceneId),
  requiresContext: true,
  defaultSettings: {},
});
