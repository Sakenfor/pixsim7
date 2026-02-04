/* eslint-disable react-refresh/only-export-components */
/**
 * Appearance Settings Module (Bridge Pattern)
 *
 * Icon pack selection and appearance settings.
 * Uses DynamicSettingsPanel with schema from icon.settings.tsx.
 */

import { settingsRegistry } from '../../lib/core/registry';
import { registerIconSettings } from '../../lib/schemas/icon.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

registerIconSettings();

function AppearanceSettingsPanel() {
  return <DynamicSettingsPanel categoryId="appearance" />;
}

settingsRegistry.register({
  id: 'appearance',
  label: 'Appearance',
  icon: '🎨',
  component: AppearanceSettingsPanel,
  order: 15,
});
