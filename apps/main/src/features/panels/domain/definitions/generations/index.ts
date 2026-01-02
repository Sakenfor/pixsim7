import { definePanel } from '../../../lib/definePanel';
import { GenerationsPanel } from '@features/generation';

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
