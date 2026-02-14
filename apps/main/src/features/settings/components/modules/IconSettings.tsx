/* eslint-disable react-refresh/only-export-components */
/**
 * Appearance Settings Module (Bridge Pattern)
 *
 * Icon pack selection and theme settings.
 * Uses DynamicSettingsPanel with schema from icon.settings.tsx and theme.settings.tsx.
 */

import { settingsRegistry } from '../../lib/core/registry';
import { registerIconSettings } from '../../lib/schemas/icon.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

registerIconSettings();

function IconsSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="appearance" tabId="icons" />
    </div>
  );
}

function ThemeSettings() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="appearance" tabId="theme" />
    </div>
  );
}

/** Default component - shows icons settings (first sub-section) */
function AppearanceSettingsPanel() {
  return <IconsSettings />;
}

settingsRegistry.register({
  id: 'appearance',
  label: 'Appearance',
  icon: '🎨',
  component: AppearanceSettingsPanel,
  order: 15,
  subSections: [
    {
      id: 'icons',
      label: 'Icons',
      icon: 'palette',
      component: IconsSettings,
    },
    {
      id: 'theme',
      label: 'Theme',
      icon: 'paintbrush',
      component: ThemeSettings,
    },
  ],
});
