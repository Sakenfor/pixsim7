
/**
 * Theme Settings Schema
 *
 * Controls color scheme and accent color via the unified appearance store.
 */

import { settingsSchemaRegistry, type SettingTab } from '../core';

import { useAppearanceSettingsAdapter } from './appearance.adapter';

const themeTab: SettingTab = {
  id: 'theme',
  label: 'Theme',
  icon: 'paintbrush',
  groups: [
    {
      id: 'color-scheme',
      title: 'Color Scheme',
      description: 'Choose how the app adapts to light and dark environments.',
      fields: [
        {
          id: 'colorScheme',
          type: 'select',
          label: 'Color Scheme',
          description: 'Controls whether the UI uses a light or dark background.',
          defaultValue: 'system',
          options: [
            { value: 'system', label: 'System (Default)' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
        },
      ],
    },
    {
      id: 'accent-color',
      title: 'Accent Color',
      description: 'Choose the primary accent color used for buttons, links, and highlights.',
      fields: [
        {
          id: 'accentColor',
          type: 'select',
          label: 'Accent Color',
          description: 'Changes the accent color across the entire UI.',
          defaultValue: 'blue',
          options: [
            { value: 'blue', label: 'Blue (Default)' },
            { value: 'purple', label: 'Purple' },
            { value: 'emerald', label: 'Emerald' },
            { value: 'rose', label: 'Rose' },
            { value: 'amber', label: 'Amber' },
          ],
        },
      ],
    },
  ],
};

export function registerThemeSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    tab: themeTab,
    useStore: useAppearanceSettingsAdapter,
  });
}
