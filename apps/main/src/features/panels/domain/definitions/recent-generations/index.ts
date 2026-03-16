import { RecentGenerationsPanel } from '@features/generation/components/RecentGenerationsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'recent-generations',
  title: 'Recent Assets',
  component: RecentGenerationsPanel,
  category: 'generation',
  tags: ['generation', 'recent', 'output'],
  icon: 'sparkles',
  description: 'Browse recently generated assets',
  consumesCapabilities: ['generation:scope'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
  internal: true,
});
