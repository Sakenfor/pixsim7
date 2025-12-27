import { definePanel } from '../../lib/definePanel';
import { ProviderSettingsPanel } from '@features/providers/components/ProviderSettingsPanel';

export default definePanel({
  id: 'providers',
  title: 'Provider Settings',
  component: ProviderSettingsPanel,
  category: 'system',
  tags: ['providers', 'api', 'settings'],
  icon: 'plug',
  description: 'API provider settings and configuration',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
