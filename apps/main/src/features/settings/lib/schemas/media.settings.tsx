/**
 * Media Settings Schema
 *
 * Performance and storage settings for media handling.
 */

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '@features/settings';
import { useMediaSettingsStore } from '@/stores/mediaSettingsStore';

const mediaGroups: SettingGroup[] = [
  {
    id: 'performance',
    title: 'Performance & Storage',
    description: 'Control how media is cached and displayed.',
    fields: [
      {
        id: 'preventDiskCache',
        type: 'toggle',
        label: 'Prevent Disk Cache for Thumbnails',
        description: 'Keeps thumbnails in memory only. Reduces Chrome cache on C: drive but uses more RAM.',
        defaultValue: false,
      },
    ],
  },
];

function useMediaSettingsStoreAdapter(): SettingStoreAdapter {
  const preventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const setPreventDiskCache = useMediaSettingsStore((s) => s.setPreventDiskCache);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'preventDiskCache') return preventDiskCache;
      return undefined;
    },
    set: (fieldId: string, value: any) => {
      if (fieldId === 'preventDiskCache') setPreventDiskCache(value);
    },
    getAll: () => ({
      preventDiskCache,
    }),
  };
}

export function registerMediaSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'media',
    category: {
      label: 'Media',
      icon: '🎬',
      order: 40,
    },
    groups: mediaGroups,
    useStore: useMediaSettingsStoreAdapter,
  });
}
