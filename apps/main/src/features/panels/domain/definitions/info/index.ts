import { InfoPanel } from '@features/panels/components/helpers';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'info',
  title: 'Info',
  component: InfoPanel,
  category: 'tools',
  panelRole: 'sub-panel',
  browsable: false,
  tags: ['metadata', 'info', 'helper', 'context-aware'],
  icon: 'info',
  description: 'Information panel that shows metadata for the current context',
  availableIn: ['asset-viewer'],
  showWhen: (context) => !!(context.currentAsset || context.currentSceneId),
  requiresContext: true,
  defaultSettings: {},
});
