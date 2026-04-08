import { QuickGenHistoryPanel } from '@features/generation/components/QuickGenHistoryPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'quickgen-history',
  title: 'QuickGen History',
  component: QuickGenHistoryPanel,
  category: 'generation',
  panelRole: 'sub-panel',
  tags: ['generation', 'history', 'quickgen', 'asset-gallery'],
  icon: 'history',
  description: 'Asset history panel for quick generation workflows',
  consumesCapabilities: ['generation:scope'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
  internal: true,
});
