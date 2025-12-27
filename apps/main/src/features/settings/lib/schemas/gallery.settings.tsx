/**
 * Gallery Settings Schema
 *
 * User preferences for gallery display behavior.
 * Settings are stored in the unified assetViewerStore.
 */

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';
import { useAssetViewerStore, type GalleryQualityMode } from '@features/assets';

const galleryGroups: SettingGroup[] = [
  {
    id: 'quality',
    title: 'Gallery Quality',
    description: 'Control image quality in gallery views.',
    fields: [
      {
        id: 'qualityMode',
        type: 'select',
        label: 'Image Quality',
        description: 'Choose between thumbnails (fast), previews (high quality), or auto (adaptive).',
        defaultValue: 'auto',
        options: [
          { value: 'thumbnail', label: 'Thumbnails (320px, fastest)' },
          { value: 'preview', label: 'Previews (800px, best quality)' },
          { value: 'auto', label: 'Auto (preview when available)' },
        ],
      },
    ],
  },
];

function useGallerySettingsStoreAdapter(): SettingStoreAdapter {
  const qualityMode = useAssetViewerStore((s) => s.settings.qualityMode);
  const updateSettings = useAssetViewerStore((s) => s.updateSettings);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'qualityMode') return qualityMode;
      return undefined;
    },

    set: (fieldId: string, value: unknown) => {
      if (fieldId === 'qualityMode') {
        updateSettings({ qualityMode: value as GalleryQualityMode });
      }
    },

    getAll: () => ({
      qualityMode,
    }),
  };
}

export function registerGallerySettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'gallery',
    category: {
      label: 'Gallery',
      icon: '🖼️',
      order: 45,
    },
    groups: galleryGroups,
    useStore: useGallerySettingsStoreAdapter,
  });
}
