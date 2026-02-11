 
/**
 * Theme Settings Schema
 *
 * Controls the accent color used across the UI via CSS variable tokens.
 */

import { useThemeSettingsStore, type AccentColor } from '@features/theme';

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';

const themeTab: SettingTab = {
  id: 'theme',
  label: 'Theme',
  icon: 'paintbrush',
  groups: [
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

function useThemeSettingsStoreAdapter(): SettingStoreAdapter {
  const accentColor = useThemeSettingsStore((s) => s.accentColor);
  const setAccentColor = useThemeSettingsStore((s) => s.setAccentColor);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'accentColor') return accentColor;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'accentColor') {
        setAccentColor((value as AccentColor) ?? 'blue');
      }
    },
    getAll: () => ({
      accentColor,
    }),
  };
}

export function registerThemeSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    tab: themeTab,
    useStore: useThemeSettingsStoreAdapter,
  });
}
