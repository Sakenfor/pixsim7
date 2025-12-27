import { definePanel } from '../../lib/definePanel';
import { InfoPanel } from '@features/panels/components/helpers';

export default definePanel({
  id: 'info',
  title: 'Info',
  component: InfoPanel,
  category: 'tools',
  tags: ['metadata', 'info', 'helper', 'context-aware'],
  icon: 'info',
  description: 'Information panel that shows metadata for the current context',
  availableIn: ['asset-viewer'],
  showWhen: (context) => !!(context.currentAsset || context.currentSceneId),
  requiresContext: true,
  defaultSettings: {},
});
