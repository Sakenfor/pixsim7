import { ProviderSettingsPanel } from '@features/providers/components/ProviderSettingsPanel';

import { definePanel } from '../../../lib/definePanel';

export default definePanel({
  id: 'providers',
  title: 'Provider Settings',
  component: ProviderSettingsPanel,
  category: 'system',
  tags: ['providers', 'api', 'settings'],
  icon: 'plug',
  description: 'API provider settings and configuration',
  navigation: {
    featureIds: ['generation'],
    modules: ['generation-page', 'settings-page'],
    order: 50,
  },
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
