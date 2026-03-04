import { HealthPanel } from '@/components/health/HealthPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'health',
  title: 'Health',
  component: HealthPanel,
  category: 'system',
  tags: ['health', 'monitoring', 'validation', 'diagnostics'],
  icon: 'heart',
  description: 'System health and validation',
  navigation: {
    openPreference: 'float-preferred',
  },
  contextLabel: 'preset',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
