/**
 * Context Hub Settings Schema
 *
 * Centralized settings for context capability routing and UI integration.
 */

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';
import { useContextHubSettingsStore } from '@features/contextHub';

const contextHubTab: SettingTab = {
  id: 'context-hub',
  label: 'Context Hub',
  icon: 'dY"?',
  groups: [
    {
      id: 'context-menu',
      title: 'Context Menus',
      description: 'Configure how custom right-click menus behave.',
      fields: [
        {
          id: 'enableMediaCardContextMenu',
          type: 'toggle',
          label: 'Enable Media Card Context Menu',
          description: 'Show the custom right-click menu on asset cards.',
          defaultValue: false,
        },
      ],
    },
  ],
};

function useContextSettingsStore(): SettingStoreAdapter {
  const enableMediaCardContextMenu = useContextHubSettingsStore(
    (s) => s.enableMediaCardContextMenu,
  );
  const setEnableMediaCardContextMenu = useContextHubSettingsStore(
    (s) => s.setEnableMediaCardContextMenu,
  );

  return {
    get: (fieldId: string) => {
      if (fieldId === 'enableMediaCardContextMenu') return enableMediaCardContextMenu;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'enableMediaCardContextMenu') {
        setEnableMediaCardContextMenu(Boolean(value));
      }
    },
    getAll: () => ({
      enableMediaCardContextMenu,
    }),
  };
}

export function registerContextSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'context',
    category: {
      label: 'Context',
      icon: 'dY"?',
      order: 24,
    },
    tab: contextHubTab,
    useStore: useContextSettingsStore,
  });
}
