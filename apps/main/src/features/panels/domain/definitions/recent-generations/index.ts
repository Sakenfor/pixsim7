import { RecentGenerationsPanel } from '@features/generation/components/RecentGenerationsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'recent-generations',
  title: 'Recent Assets',
  component: RecentGenerationsPanel,
  category: 'generation',
  panelRole: 'sub-panel',
  tags: ['generation', 'recent', 'output', 'asset-gallery'],
  icon: 'history',
  description: 'Browse recently generated assets',
  consumesCapabilities: ['generation:scope'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
  internal: true,
});
