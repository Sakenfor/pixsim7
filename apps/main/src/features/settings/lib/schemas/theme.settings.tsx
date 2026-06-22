
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
    {
      id: 'button-style',
      title: 'Button Style',
      description: 'Controls how accent-colored action buttons are rendered.',
      fields: [
        {
          id: 'buttonStyle',
          type: 'select',
          label: 'Button Style',
          description: 'Applies to primary action buttons like Go and Each.',
          defaultValue: 'gradient',
          options: [
            { value: 'gradient', label: 'Gradient (Default)' },
            { value: 'solid', label: 'Solid' },
            { value: 'soft', label: 'Soft' },
          ],
        },
      ],
    },
    {
      id: 'badge-style',
      title: 'Badge Style',
      description: 'Controls how media-card badges are rendered.',
      fields: [
        {
          id: 'badgeSkin',
          type: 'select',
          label: 'Badge Style',
          description: 'Flat 2D pills, or 3D CSS cubes (e.g. the top-left similarity badge).',
          defaultValue: 'flat',
          options: [
            { value: 'flat', label: 'Flat (Default)' },
            { value: 'cube', label: '3D Cube' },
          ],
        },
      ],
    },
    {
      id: 'icon-style',
      title: 'Icon Style',
      description: 'Controls how surface glyphs are rendered.',
      fields: [
        {
          id: 'iconSkin',
          type: 'select',
          label: 'Icon Style',
          description: 'Flat SVG glyphs, or 3D CSS cubes (currently the AI assistant tab icons).',
          defaultValue: 'flat',
          options: [
            { value: 'flat', label: 'Flat (Default)' },
            { value: 'cube', label: '3D Cube' },
          ],
        },
        {
          id: 'cubeMotionPreset',
          type: 'select',
          label: 'Cube Motion',
          description: 'How 3D-cube icons animate to signal status (applies when Icon Style is 3D Cube).',
          defaultValue: 'lively',
          options: [
            { value: 'lively', label: 'Lively (Default)' },
            { value: 'calm', label: 'Calm' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'off', label: 'Off' },
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
