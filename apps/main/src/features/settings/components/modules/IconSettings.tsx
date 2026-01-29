/* eslint-disable react-refresh/only-export-components */
/**
 * Icon Settings Module
 *
 * Registers schema-based icon settings and exposes them in the Settings panel.
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
