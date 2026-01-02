import { definePanel } from '../../../lib/definePanel';
import { SettingsPanel as QuickGenSettingsPanel } from '@features/controlCenter/components/QuickGeneratePanels';
import { QUICKGEN_SETTINGS_COMPONENT_ID } from '@features/controlCenter/lib/quickGenerateComponentSettings';

export default definePanel({
  id: 'quickgen-settings',
  title: 'QuickGen Settings',
  component: QuickGenSettingsPanel,
  category: 'generation',
  tags: ['generation', 'settings', 'quickgen', 'control-center'],
  icon: 'settings',
  description: 'Generation settings and Go button for quick workflows',
  availableIn: ['control-center'],
  settingScopes: ['generation'],
  componentSettings: [QUICKGEN_SETTINGS_COMPONENT_ID],
  supportsCompactMode: false,
  supportsMultipleInstances: false,
});
