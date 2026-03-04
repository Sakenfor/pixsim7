/**
 * Shared Appearance Settings Adapter
 *
 * Single adapter that handles all appearance-related fields (colorScheme,
 * accentColor, iconTheme, iconSetId). Used by both theme.settings.tsx and
 * icon.settings.tsx registrations.
 *
 * Critical because settingsSchemaRegistry stores one `useStore` per category
 * (from the first registration), so both tabs must share the same adapter.
 */

import {
  useAppearanceStore,
  type AccentColor,
  type ButtonStyle,
  type ColorScheme,
  type IconTheme,
} from '@features/appearance';

import type { SettingStoreAdapter } from '../core';

export function useAppearanceSettingsAdapter(): SettingStoreAdapter {
  const colorScheme = useAppearanceStore((s) => s.colorScheme);
  const setColorScheme = useAppearanceStore((s) => s.setColorScheme);
  const accentColor = useAppearanceStore((s) => s.accentColor);
  const setAccentColor = useAppearanceStore((s) => s.setAccentColor);
  const iconTheme = useAppearanceStore((s) => s.iconTheme);
  const setIconTheme = useAppearanceStore((s) => s.setIconTheme);
  const iconSetId = useAppearanceStore((s) => s.iconSetId);
  const setIconSetId = useAppearanceStore((s) => s.setIconSetId);
  const buttonStyle = useAppearanceStore((s) => s.buttonStyle);
  const setButtonStyle = useAppearanceStore((s) => s.setButtonStyle);

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'colorScheme': return colorScheme;
        case 'accentColor': return accentColor;
        case 'iconTheme': return iconTheme;
        case 'iconSetId': return iconSetId;
        case 'buttonStyle': return buttonStyle;
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'colorScheme': setColorScheme((value as ColorScheme) ?? 'system'); break;
        case 'accentColor': setAccentColor((value as AccentColor) ?? 'blue'); break;
        case 'iconTheme': setIconTheme((value as IconTheme) ?? 'inherit'); break;
        case 'iconSetId': setIconSetId(String(value || 'outline')); break;
        case 'buttonStyle': setButtonStyle((value as ButtonStyle) ?? 'gradient'); break;
      }
    },
    getAll: () => ({
      colorScheme,
      accentColor,
      iconTheme,
      iconSetId,
      buttonStyle,
    }),
  };
}
