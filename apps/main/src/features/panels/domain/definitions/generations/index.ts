import { GenerationsPanel } from '@features/generation/components/GenerationsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'generations',
  title: 'Generations',
  component: GenerationsPanel,
  category: 'workspace',
  tags: ['generations', 'jobs', 'status', 'monitoring', 'tracking'],
  icon: 'sparkles',
  description: 'Track and manage generation jobs',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
