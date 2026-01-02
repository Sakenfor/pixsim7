import { definePanel } from '../../../lib/definePanel';
import { SettingsPanel } from '@features/settings/components/SettingsPanel';

export default definePanel({
  id: 'settings',
  title: 'Settings',
  component: SettingsPanel,
  category: 'utilities',
  tags: ['settings', 'configuration', 'preferences'],
  icon: 'settings',
  description: 'Application settings and preferences',
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
