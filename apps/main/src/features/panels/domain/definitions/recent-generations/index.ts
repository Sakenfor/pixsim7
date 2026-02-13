import { RecentGenerationsPanel } from '@features/generation/components/RecentGenerationsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'recent-generations',
  title: 'Recent Generations',
  component: RecentGenerationsPanel,
  category: 'generation',
  tags: ['generation', 'recent', 'output'],
  icon: 'sparkles',
  description: 'Browse recently completed generation outputs',
  settingScopes: ['generation'],
  supportsCompactMode: true,
  supportsMultipleInstances: false,
  internal: true,
});
