 
/**
 * Model Badge Settings Schema
 *
 * Lets users toggle badge visibility and override per-family badge colours.
 */

import { useModelBadgeStore } from '@features/providers';

import { settingsSchemaRegistry, type SettingStoreAdapter, type SettingTab } from '../core';

function useModelBadgeSettingsAdapter(): SettingStoreAdapter {
  const showOnMediaCards = useModelBadgeStore((s) => s.showOnMediaCards);
  const setShowOnMediaCards = useModelBadgeStore((s) => s.setShowOnMediaCards);
  const colors = useModelBadgeStore((s) => s.colors);
  const setColor = useModelBadgeStore((s) => s.setColor);
  const resetAllColors = useModelBadgeStore((s) => s.resetAllColors);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'showOnMediaCards') return showOnMediaCards;
      if (fieldId === 'resetAll') return false; // action field, always false
      // color-<family> fields
      if (fieldId.startsWith('color-')) {
        const modelId = fieldId.slice('color-'.length);
        return colors[modelId] ?? undefined;
      }
      return undefined;
    },
    set: (fieldId: string, value: unknown) => {
      if (fieldId === 'showOnMediaCards') {
        setShowOnMediaCards(Boolean(value));
        return;
      }
      if (fieldId === 'resetAll') {
        resetAllColors();
        return;
      }
      if (fieldId.startsWith('color-') && typeof value === 'string') {
        const modelId = fieldId.slice('color-'.length);
        setColor(modelId, value);
      }
    },
    getAll: () => ({ showOnMediaCards, colors }),
  };
}

const modelBadgeTab: SettingTab = {
  id: 'model-badges',
  label: 'Model Badges',
  icon: 'tag',
  groups: [
    {
      id: 'badge-visibility',
      title: 'Visibility',
      fields: [
        {
          id: 'showOnMediaCards',
          type: 'toggle',
          label: 'Show on media cards',
          description: 'Display model family badges on media card thumbnails.',
          defaultValue: true,
        },
      ],
    },
    {
      id: 'badge-colors-gemini',
      title: 'Gemini Colours',
      description: 'Override badge colours for Gemini models. Leave blank for defaults.',
      fields: [
        { id: 'color-gemini-3.0',       type: 'color', label: 'Gemini 3.0 (Premium)',   defaultValue: '#7c3aed' },
        { id: 'color-gemini-3.1-flash',  type: 'color', label: 'Gemini 3.1 Flash',      defaultValue: '#1a73e8' },
        { id: 'color-gemini-2.5-flash',  type: 'color', label: 'Gemini 2.5 Flash',      defaultValue: '#6b7280' },
      ],
    },
    {
      id: 'badge-colors-seedream',
      title: 'Seedream Colours',
      fields: [
        { id: 'color-seedream-5.0-lite', type: 'color', label: 'Seedream 5.0 Lite',     defaultValue: '#dc2626' },
        { id: 'color-seedream-4.5',      type: 'color', label: 'Seedream 4.5',           defaultValue: '#e85d04' },
        { id: 'color-seedream-4.0',      type: 'color', label: 'Seedream 4.0',           defaultValue: '#d4d4d8' },
      ],
    },
    {
      id: 'badge-colors-other',
      title: 'Other Families',
      fields: [
        { id: 'color-qwen-image',  type: 'color', label: 'Qwen',     defaultValue: '#6366f1' },
        { id: 'color-v5',          type: 'color', label: 'Pixverse',  defaultValue: '#8b5cf6' },
      ],
    },
  ],
};

export function registerModelBadgeSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    category: {
      label: 'Appearance',
      icon: 'palette',
      order: 15,
    },
    tab: modelBadgeTab,
    useStore: useModelBadgeSettingsAdapter,
  });
}
