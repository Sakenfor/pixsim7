/* eslint-disable react-refresh/only-export-components */
/**
 * Icon Theme Settings Schema
 *
 * Controls the global icon style/theme used across the UI.
 */

import { useEffect, useState } from 'react';

import { iconSetRegistry } from '@lib/icons';

import { useIconSettingsStore, type IconTheme } from '@features/icons';

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';

function IconSetSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [sets, setSets] = useState(() => iconSetRegistry.getAll());

  useEffect(() => {
    return iconSetRegistry.subscribe(() => setSets(iconSetRegistry.getAll()));
  }, []);

  return (
    <select
      value={value ?? 'outline'}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {sets.map((set) => (
        <option key={set.id} value={set.id}>
          {set.label}
        </option>
      ))}
    </select>
  );
}

const iconTab: SettingTab = {
  id: 'icons',
  label: 'Icons',
  icon: 'palette',
  groups: [
    {
      id: 'icon-theme',
      title: 'Icon Theme',
      description: 'Choose a consistent icon style across the UI.',
      fields: [
        {
          id: 'iconSetId',
          type: 'custom',
          label: 'Icon Set',
          description: 'Controls the default icon style across the app.',
          defaultValue: 'outline',
          component: IconSetSelect,
        },
        {
          id: 'iconTheme',
          type: 'select',
          label: 'Default Icon Style',
          description: 'Overrides the default icon color when no explicit color is set.',
          defaultValue: 'inherit',
          options: [
            { value: 'inherit', label: 'Follow Text Color (Default)' },
            { value: 'muted', label: 'Muted (Gray)' },
            { value: 'accent', label: 'Accent (Blue)' },
          ],
        },
      ],
    },
  ],
};

function useIconSettingsStoreAdapter(): SettingStoreAdapter {
  const iconTheme = useIconSettingsStore((s) => s.iconTheme);
  const setIconTheme = useIconSettingsStore((s) => s.setIconTheme);
  const iconSetId = useIconSettingsStore((s) => s.iconSetId);
  const setIconSetId = useIconSettingsStore((s) => s.setIconSetId);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'iconTheme') return iconTheme;
      if (fieldId === 'iconSetId') return iconSetId;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'iconSetId') {
        setIconSetId(String(value || 'outline'));
      }
      if (fieldId === 'iconTheme') {
        setIconTheme((value as IconTheme) ?? 'inherit');
      }
    },
    getAll: () => ({
      iconTheme,
      iconSetId,
    }),
  };
}

export function registerIconSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'appearance',
    category: {
      label: 'Appearance',
      icon: 'palette',
      order: 15,
    },
    tab: iconTab,
    useStore: useIconSettingsStoreAdapter,
  });
}
