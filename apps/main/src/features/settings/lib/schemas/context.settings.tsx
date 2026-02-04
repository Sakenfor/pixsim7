/**
 * Context Hub Settings Schema
 *
 * Centralized settings for context capability routing and UI integration.
 */

import { useContextHubSettingsStore } from '@features/contextHub';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

const contextMenuGroup: SettingGroup = {
  id: 'context-menu',
  title: 'Context Menus',
  description: 'Configure how custom right-click menus behave.',
  fields: [
    {
      id: 'enableMediaCardContextMenu',
      type: 'toggle',
      label: 'Enable Media Card Context Menu',
      description: 'Show the custom right-click menu on asset cards.',
      defaultValue: true,
    },
  ],
};

const capabilitiesGroup: SettingGroup = {
  id: 'capabilities',
  title: 'Capability System',
  description: 'Configure capability-based context awareness.',
  fields: [
    {
      id: 'enableCapabilityFiltering',
      type: 'toggle',
      label: 'Enable Capability Filtering',
      description: 'Filter context menu actions based on available capabilities (requiredCapabilities). Disable to show all actions regardless of context.',
      defaultValue: true,
    },
    {
      id: 'showCapabilityDebug',
      type: 'toggle',
      label: 'Show Capability Debug Info',
      description: 'Display capability information in the Properties popup for debugging.',
      defaultValue: false,
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
  const enableCapabilityFiltering = useContextHubSettingsStore(
    (s) => s.enableCapabilityFiltering,
  );
  const setEnableCapabilityFiltering = useContextHubSettingsStore(
    (s) => s.setEnableCapabilityFiltering,
  );
  const showCapabilityDebug = useContextHubSettingsStore(
    (s) => s.showCapabilityDebug,
  );
  const setShowCapabilityDebug = useContextHubSettingsStore(
    (s) => s.setShowCapabilityDebug,
  );

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'enableMediaCardContextMenu': return enableMediaCardContextMenu;
        case 'enableCapabilityFiltering': return enableCapabilityFiltering;
        case 'showCapabilityDebug': return showCapabilityDebug;
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'enableMediaCardContextMenu':
          setEnableMediaCardContextMenu(Boolean(value));
          break;
        case 'enableCapabilityFiltering':
          setEnableCapabilityFiltering(Boolean(value));
          break;
        case 'showCapabilityDebug':
          setShowCapabilityDebug(Boolean(value));
          break;
      }
    },
    getAll: () => ({
      enableMediaCardContextMenu,
      enableCapabilityFiltering,
      showCapabilityDebug,
    }),
  };
}

export function registerContextSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'context',
    category: {
      label: 'Context',
      icon: '🔗',
      order: 60,
    },
    groups: [contextMenuGroup, capabilitiesGroup],
    useStore: useContextSettingsStore,
  });
}
