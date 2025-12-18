/**
 * Gallery Settings Schema
 *
 * User preferences for gallery display behavior.
 */

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';
import { useGallerySettingsStore, type GalleryQualityMode } from '@/stores/gallerySettingsStore';

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
  const qualityMode = useGallerySettingsStore((s) => s.qualityMode);
  const setQualityMode = useGallerySettingsStore((s) => s.setQualityMode);

  return {
    get: (fieldId: string) => {
      if (fieldId === 'qualityMode') return qualityMode;
      return undefined;
    },

    set: (fieldId: string, value: any) => {
      if (fieldId === 'qualityMode') {
        setQualityMode(value as GalleryQualityMode);
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
