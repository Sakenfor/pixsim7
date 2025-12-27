import { definePanel } from '../../lib/definePanel';
import { PresetsModule } from '@features/controlCenter/components/PresetsModule';

export default definePanel({
  id: 'presets',
  title: 'Generation Presets',
  component: PresetsModule,
  category: 'tools',
  tags: ['generation', 'presets', 'config', 'templates'],
  icon: 'sliders',
  description: 'Browse and apply generation presets with operator support',
  availableIn: ['workspace', 'control-center'],
  settingScopes: ['generation'],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
