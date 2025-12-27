import { definePanel } from '../../lib/definePanel';
import { HealthPanel } from '@/components/health/HealthPanel';

export default definePanel({
  id: 'health',
  title: 'Health',
  component: HealthPanel,
  category: 'system',
  tags: ['health', 'monitoring', 'validation', 'diagnostics'],
  icon: 'heart',
  description: 'System health and validation',
  contextLabel: 'preset',
  supportsCompactMode: true,
  supportsMultipleInstances: false,
});
