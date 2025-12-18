/**
 * Media Settings Schema
 *
 * Performance and storage settings for media handling.
 * Includes both local (browser-persisted) and server-side settings.
 */

import { useEffect } from 'react';
import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';
import { useMediaSettingsStore, type ServerMediaSettings } from '@/stores/mediaSettingsStore';
import { apiClient } from '@/lib/api';

// Fetch server settings on mount
async function fetchServerSettings(): Promise<ServerMediaSettings> {
  const response = await apiClient.get('/media/settings');
  return response.data;
}

// Update server setting
async function updateServerSetting(
  key: keyof ServerMediaSettings,
  value: any
): Promise<ServerMediaSettings> {
  const response = await apiClient.patch('/media/settings', { [key]: value });
  return response.data;
}

const mediaGroups: SettingGroup[] = [
  {
    id: 'local-performance',
    title: 'Browser Performance',
    description: 'Local browser settings that affect memory and disk usage.',
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
  {
    id: 'ingestion',
    title: 'Media Ingestion',
    description: 'Control how media is downloaded and stored on the server.',
    fields: [
      {
        id: 'ingest_on_asset_add',
        type: 'toggle',
        label: 'Auto-Ingest New Assets',
        description: 'Automatically download and store media when assets are created. Enables local serving and thumbnails.',
        defaultValue: true,
      },
      {
        id: 'prefer_local_over_provider',
        type: 'toggle',
        label: 'Prefer Local Storage',
        description: 'Serve media from local storage instead of provider CDN when available.',
        defaultValue: true,
      },
      {
        id: 'generate_thumbnails',
        type: 'toggle',
        label: 'Generate Thumbnails',
        description: 'Create thumbnails for images and videos during ingestion.',
        defaultValue: true,
      },
      {
        id: 'generate_previews',
        type: 'toggle',
        label: 'Generate Previews',
        description: 'Create higher-quality preview images (800x800) for better gallery display.',
        defaultValue: true,
      },
    ],
  },
  {
    id: 'quality',
    title: 'Image Quality',
    description: 'Control JPEG quality settings for thumbnails and previews.',
    fields: [
      {
        id: 'thumbnail_quality',
        type: 'number',
        label: 'Thumbnail Quality',
        description: 'JPEG quality for thumbnails (1-100). Lower uses less disk space.',
        defaultValue: 85,
        min: 60,
        max: 100,
      },
      {
        id: 'preview_quality',
        type: 'number',
        label: 'Preview Quality',
        description: 'JPEG quality for previews (1-100). Higher preserves more detail.',
        defaultValue: 92,
        min: 70,
        max: 100,
      },
    ],
  },
  {
    id: 'limits',
    title: 'Limits & Performance',
    description: 'Control resource usage for media processing.',
    fields: [
      {
        id: 'max_download_size_mb',
        type: 'number',
        label: 'Max Download Size (MB)',
        description: 'Maximum file size to download from providers.',
        defaultValue: 500,
        min: 10,
        max: 2000,
      },
      {
        id: 'concurrency_limit',
        type: 'number',
        label: 'Concurrent Ingestion Jobs',
        description: 'Maximum number of simultaneous ingestion tasks.',
        defaultValue: 4,
        min: 1,
        max: 16,
      },
      {
        id: 'cache_control_max_age_seconds',
        type: 'number',
        label: 'Cache Max Age (seconds)',
        description: 'Browser cache duration for served media files.',
        defaultValue: 86400,
        min: 0,
        max: 604800,
      },
    ],
  },
];

function useMediaSettingsStoreAdapter(): SettingStoreAdapter {
  // Local settings
  const preventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const setPreventDiskCache = useMediaSettingsStore((s) => s.setPreventDiskCache);

  // Server settings
  const serverSettings = useMediaSettingsStore((s) => s.serverSettings);
  const setServerSettings = useMediaSettingsStore((s) => s.setServerSettings);
  const setServerSettingsLoading = useMediaSettingsStore((s) => s.setServerSettingsLoading);
  const setServerSettingsError = useMediaSettingsStore((s) => s.setServerSettingsError);

  // Fetch server settings on first access
  useEffect(() => {
    if (!serverSettings) {
      setServerSettingsLoading(true);
      fetchServerSettings()
        .then((settings) => {
          setServerSettings(settings);
          setServerSettingsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to fetch media settings:', error);
          setServerSettingsError(error.message);
          setServerSettingsLoading(false);
        });
    }
  }, [serverSettings, setServerSettings, setServerSettingsLoading, setServerSettingsError]);

  return {
    get: (fieldId: string) => {
      // Local settings
      if (fieldId === 'preventDiskCache') return preventDiskCache;

      // Server settings
      if (serverSettings && fieldId in serverSettings) {
        return serverSettings[fieldId as keyof ServerMediaSettings];
      }

      return undefined;
    },

    set: (fieldId: string, value: any) => {
      // Local settings
      if (fieldId === 'preventDiskCache') {
        setPreventDiskCache(value);
        return;
      }

      // Server settings - update optimistically and sync to backend
      if (serverSettings && fieldId in serverSettings) {
        // Optimistic update
        const updatedSettings = { ...serverSettings, [fieldId]: value };
        setServerSettings(updatedSettings);

        // Sync to backend
        updateServerSetting(fieldId as keyof ServerMediaSettings, value)
          .then((newSettings) => {
            setServerSettings(newSettings);
          })
          .catch((error) => {
            console.error('Failed to update media setting:', error);
            // Revert on error
            setServerSettings(serverSettings);
            setServerSettingsError(error.message);
          });
      }
    },

    getAll: () => ({
      preventDiskCache,
      ...(serverSettings ?? {}),
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
