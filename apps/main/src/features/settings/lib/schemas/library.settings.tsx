/**
 * Library Settings Schema
 *
 * Unified settings for all library/media-related functionality:
 * - Browser: Client-side cache and quality preferences
 * - Downloads: Asset download behavior
 * - Storage: Server-side ingestion and quality settings
 * - Maintenance: Admin tools for storage management
 *
 * Replaces the separate Assets, Media, and Gallery settings.
 */

import { useEffect, useState } from 'react';

import { useMediaSettingsStore, type ServerMediaSettings } from '@features/assets';
import { useAssetSettingsStore } from '@features/assets';
import { useAssetViewerStore, type GalleryQualityMode } from '@features/assets';
import { useLocalFolderSettingsStore } from '@features/assets';
import { usePanelConfigStore, type GalleryPanelSettings, type GalleryGroupMultiLayout } from '@features/panels';

import { pixsimClient } from '@/lib/api';
import { getUserPreferences, updatePreferenceKey } from '@/lib/api/userPreferences';

import { ContentPacksDashboard } from '../../components/shared/ContentPacksDashboard';
import { LocalFoldersStatus } from '../../components/shared/LocalFoldersStatus';
import { MaintenanceDashboard } from '../../components/shared/MaintenanceDashboard';
import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';

const adminOnly = (values: Record<string, any>) => !!values.__isAdmin;

// Fetch server settings on mount
async function fetchServerSettings(): Promise<ServerMediaSettings> {
  return pixsimClient.get<ServerMediaSettings>('/media/settings');
}

// Update server setting
async function updateServerSetting(
  key: keyof ServerMediaSettings,
  value: any
): Promise<ServerMediaSettings> {
  return pixsimClient.patch<ServerMediaSettings>('/media/settings', { [key]: value });
}

// =============================================================================
// Tab: Browser
// =============================================================================
const displayTab: SettingTab = {
  id: 'display',
  label: 'Display',
  icon: '🖼️',
  groups: [
    // ------------------------------------------------------------------
    // Per-source display settings — each source type gets its own group.
    // Add new groups here when adding sources (e.g. Google Drive).
    // ------------------------------------------------------------------
    {
      id: 'gallery',
      title: 'Gallery',
      description: 'Thumbnail quality and loading for remote/cloud provider assets.',
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
        {
          id: 'preferOriginal',
          type: 'toggle',
          label: 'Use Original Sources',
          description: 'Skip thumbnails/previews and load original images directly. Best when displaying large thumbnails.',
          defaultValue: false,
        },
      ],
    },
    {
      id: 'local-folders',
      title: 'Local Folders',
      description: 'Thumbnail loading for assets browsed from local folders.',
      fields: [
        {
          id: 'lf_previewMode',
          type: 'select',
          label: 'Preview Mode',
          description: 'Thumbnails are cached and use less memory. Original shows the file directly (fastest first load). Gallery Settings follows the Gallery source settings above.',
          defaultValue: 'thumbnail',
          options: [
            { value: 'thumbnail', label: 'Generate Thumbnails (400px, cached)' },
            { value: 'original', label: 'Original Images (fastest, more memory)' },
            { value: 'gallery-settings', label: 'Use Gallery Settings' },
          ],
        },
      ],
    },
    {
      id: 'gallery-grouping',
      title: 'Gallery Grouping',
      description: 'Layout when multiple group axes are selected in multi-mode.',
      fields: [
        {
          id: 'groupMultiLayout',
          type: 'select',
          label: 'Multi-Group Layout',
          description: 'Stack shows hierarchical drill-down. Parallel shows all axes as independent sections.',
          defaultValue: 'stack',
          options: [
            { value: 'stack', label: 'Stack (hierarchical)' },
            { value: 'parallel', label: 'Parallel (side-by-side)' },
          ],
        },
      ],
    },
    // ------------------------------------------------------------------
    // Shared settings that apply across all sources
    // ------------------------------------------------------------------
    {
      id: 'caching',
      title: 'Caching',
      description: 'Browser-level cache behavior for all media sources.',
      fields: [
        {
          id: 'preventDiskCache',
          type: 'toggle',
          label: 'Prevent Disk Cache',
          description: 'Keep thumbnails in memory only. Reduces Chrome cache on disk but uses more RAM.',
          defaultValue: false,
        },
      ],
    },
  ],
};

// =============================================================================
// Tab: Downloads
// =============================================================================
const downloadsTab: SettingTab = {
  id: 'downloads',
  label: 'Downloads',
  icon: '📥',
  groups: [
    {
      id: 'upload-dedup',
      title: 'Deduplication',
      description: 'Control which duplicate checks run when uploading assets.',
      fields: [
        {
          id: 'similarity.upload.sha256',
          type: 'toggle',
          label: 'Exact Match (SHA-256)',
          description: 'Skip upload if an identical file (same bytes) already exists.',
          defaultValue: true,
        },
        {
          id: 'similarity.upload.phash',
          type: 'toggle',
          label: 'Similar Image (pHash)',
          description: 'Skip upload if a visually similar image already exists. Disable for images with small edits.',
          defaultValue: true,
        },
        {
          id: 'similarity.upload.phashThreshold',
          type: 'range',
          label: 'Similarity Threshold',
          description: 'Max perceptual difference allowed (0 = exact visual match, higher = more lenient).',
          defaultValue: 5,
          min: 0,
          max: 16,
          step: 1,
          showWhen: (values: Record<string, any>) => !!values['similarity.upload.phash'],
        },
      ],
    },
    {
      id: 'download-behavior',
      title: 'Download Behavior',
      description: 'Configure how assets are downloaded.',
      fields: [
        {
          id: 'downloadOnGenerate',
          type: 'toggle',
          label: 'Download on Generate',
          description: 'Automatically download assets when generation completes.',
          defaultValue: false,
        },
      ],
    },
    {
      id: 'storage-format',
      title: 'Storage Format',
      description: 'Convert images to a smaller format when downloading. The original stays on the provider CDN and can be re-downloaded later.',
      fields: [
        {
          id: 'storage_format',
          type: 'select',
          label: 'Image Storage Format',
          description: 'Convert downloaded images to this format. WebP at quality 90 typically saves 60-70% vs PNG with negligible visual difference.',
          defaultValue: '',
          options: [
            { value: '', label: 'Original — Keep provider format (default)' },
            { value: 'webp', label: 'WebP — Best compression, broad support' },
            { value: 'jpeg', label: 'JPEG — Universal compatibility' },
          ],
        },
        {
          id: 'storage_quality',
          type: 'range',
          label: 'Conversion Quality',
          description: 'Quality for format conversion (1-100). 90 is a good balance of size and quality.',
          defaultValue: 90,
          min: 70,
          max: 100,
          step: 1,
          showWhen: (values: Record<string, any>) => !!values['storage_format'],
        },
      ],
    },
    {
      id: 'auto-ingestion',
      title: 'Auto-Ingestion',
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
          id: 'thumbnail_quality',
          type: 'number',
          label: 'Thumbnail JPEG Quality',
          description: 'Compression quality for generated thumbnails (1-100). Lower uses less disk space.',
          defaultValue: 85,
          min: 60,
          max: 100,
        },
        {
          id: 'generate_previews',
          type: 'toggle',
          label: 'Generate Previews',
          description: 'Create higher-quality preview images (800x800) for better gallery display.',
          defaultValue: true,
        },
        {
          id: 'preview_quality',
          type: 'number',
          label: 'Preview JPEG Quality',
          description: 'Compression quality for generated previews (1-100). Higher preserves more detail.',
          defaultValue: 92,
          min: 70,
          max: 100,
        },
      ],
    },
    {
      id: 'frame-extraction',
      title: 'Frame Extraction',
      description: 'Configure behavior when extracting frames from videos.',
      fields: [
        {
          id: 'frame_extraction_upload',
          type: 'select',
          label: 'Upload Behavior',
          description: 'Control whether extracted frames are uploaded to a provider.',
          defaultValue: 'source_provider',
          options: [
            { value: 'source_provider', label: 'Source Provider - Upload to same provider as source video' },
            { value: 'always', label: 'Always Upload - Always upload to default provider' },
            { value: 'never', label: 'Never Upload - Only save locally' },
          ],
        },
        {
          id: 'default_upload_provider',
          type: 'text',
          label: 'Default Upload Provider',
          description: 'Provider to use when "Always Upload" is selected (e.g., pixverse, sora).',
          defaultValue: 'pixverse',
        },
      ],
    },
    {
      id: 'limits',
      title: 'Limits',
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
      ],
    },
  ],
};

// =============================================================================
// Tab: Storage
// =============================================================================
const storageTab: SettingTab = {
  id: 'storage',
  label: 'Storage',
  icon: '💾',
  groups: [
    {
      id: 'cache-control',
      title: 'Cache Control',
      description: 'Configure how media is cached by browsers.',
      fields: [
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
    {
      id: 'deletion',
      title: 'Deletion',
      description: 'Configure asset deletion behavior.',
      fields: [
        {
          id: 'deleteFromProvider',
          type: 'toggle',
          label: 'Delete from Provider',
          description: 'Also delete assets from the provider (e.g., Pixverse) when deleting them locally.',
          defaultValue: true,
        },
      ],
    },
  ],
};

// =============================================================================
// Tab: Hashing
// =============================================================================
const hashingTab: SettingTab = {
  id: 'hashing',
  label: 'Hashing',
  icon: '#️⃣',
  groups: [
    {
      id: 'local-folder-hashing',
      title: 'Local Folders',
      description: 'Control when and how file hashes (SHA-256) are computed for local assets.',
      fields: [
        {
          id: 'lf_autoHashOnSelect',
          type: 'toggle',
          label: 'Auto-Hash on Folder Select',
          description: 'Automatically start hashing files when you navigate into a folder. Disable to only hash manually or on upload.',
          defaultValue: true,
        },
        {
          id: 'lf_autoCheckBackend',
          type: 'toggle',
          label: 'Auto-Check Library Duplicates',
          description: 'Automatically check hashed files against your library to detect duplicates ("Already in library").',
          defaultValue: true,
        },
        {
          id: 'lf_hashChunkSize',
          type: 'number',
          label: 'Hash Concurrency',
          description: 'Number of files to hash simultaneously. Lower values reduce system load.',
          defaultValue: 3,
          min: 1,
          max: 10,
        },
      ],
    },
    {
      id: 'local-folders-status',
      title: 'Status',
      description: 'Overview of local folder state.',
      fields: [
        {
          id: 'local-folders-widget',
          type: 'custom',
          label: 'Local Folders',
          component: LocalFoldersStatus,
        },
      ],
    },
  ],
};

// =============================================================================
// Tab: Maintenance
// =============================================================================
const maintenanceTab: SettingTab = {
  id: 'maintenance',
  label: 'Maintenance',
  icon: '🔧',
  groups: [
    {
      id: 'maintenance-dashboard',
      title: 'Maintenance',
      showWhen: adminOnly,
      adminGroup: true,
      fields: [
        {
          id: 'maintenance-dashboard-widget',
          type: 'custom',
          label: 'Maintenance',
          component: MaintenanceDashboard,
        },
      ],
    },
    {
      id: 'content-packs-dashboard',
      title: 'Content Packs',
      showWhen: adminOnly,
      adminGroup: true,
      fields: [
        {
          id: 'content-packs-dashboard-widget',
          type: 'custom',
          label: 'Content Packs',
          component: ContentPacksDashboard,
        },
      ],
    },
  ],
};

// =============================================================================
// Unified Store Adapter
// =============================================================================
function useLibrarySettingsStoreAdapter(): SettingStoreAdapter {
  // User preferences (backend - similarityChecks)
  const DEFAULT_UPLOAD_CHECKS = { sha256: true, phash: true, phashThreshold: 5 };
  const [uploadChecks, setUploadChecksLocal] = useState(DEFAULT_UPLOAD_CHECKS);
  useEffect(() => {
    getUserPreferences()
      .then((prefs) => {
        const sc = prefs.similarityChecks as Record<string, any> | undefined;
        if (sc?.upload) {
          setUploadChecksLocal({ ...DEFAULT_UPLOAD_CHECKS, ...sc.upload });
        } else if (prefs.skipSimilarCheck != null) {
          // Legacy compat
          setUploadChecksLocal({ ...DEFAULT_UPLOAD_CHECKS, phash: !prefs.skipSimilarCheck });
        }
      })
      .catch(() => {});
  }, []);

  // Asset settings (local)
  const downloadOnGenerate = useAssetSettingsStore((s) => s.downloadOnGenerate);
  const setDownloadOnGenerate = useAssetSettingsStore((s) => s.setDownloadOnGenerate);
  const deleteFromProvider = useAssetSettingsStore((s) => s.deleteFromProvider);
  const setDeleteFromProvider = useAssetSettingsStore((s) => s.setDeleteFromProvider);

  // Gallery settings (local)
  const qualityMode = useAssetViewerStore((s) => s.settings.qualityMode);
  const preferOriginal = useAssetViewerStore((s) => s.settings.preferOriginal);
  const updateGallerySettings = useAssetViewerStore((s) => s.updateSettings);

  // Media settings (local)
  const preventDiskCache = useMediaSettingsStore((s) => s.preventDiskCache);
  const setPreventDiskCache = useMediaSettingsStore((s) => s.setPreventDiskCache);

  // Gallery panel config settings (grouping layout)
  const galleryPanelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);
  const gallerySettings = (galleryPanelConfig?.settings || {}) as GalleryPanelSettings;

  // Local folder settings
  const lf_autoHashOnSelect = useLocalFolderSettingsStore((s) => s.autoHashOnSelect);
  const lf_autoCheckBackend = useLocalFolderSettingsStore((s) => s.autoCheckBackend);
  const lf_hashChunkSize = useLocalFolderSettingsStore((s) => s.hashChunkSize);
  const lf_previewMode = useLocalFolderSettingsStore((s) => s.previewMode);
  const setLfAutoHashOnSelect = useLocalFolderSettingsStore((s) => s.setAutoHashOnSelect);
  const setLfAutoCheckBackend = useLocalFolderSettingsStore((s) => s.setAutoCheckBackend);
  const setLfHashChunkSize = useLocalFolderSettingsStore((s) => s.setHashChunkSize);
  const setLfPreviewMode = useLocalFolderSettingsStore((s) => s.setPreviewMode);

  // Media settings (server)
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
      // Similarity checks (backend user preferences)
      if (fieldId === 'similarity.upload.sha256') return uploadChecks.sha256;
      if (fieldId === 'similarity.upload.phash') return uploadChecks.phash;
      if (fieldId === 'similarity.upload.phashThreshold') return uploadChecks.phashThreshold;

      // Asset settings
      if (fieldId === 'downloadOnGenerate') return downloadOnGenerate;
      if (fieldId === 'deleteFromProvider') return deleteFromProvider;

      // Gallery settings
      if (fieldId === 'qualityMode') return qualityMode;
      if (fieldId === 'preferOriginal') return preferOriginal;

      // Local media settings
      if (fieldId === 'preventDiskCache') return preventDiskCache;

      // Gallery panel config settings
      if (fieldId === 'groupMultiLayout') return gallerySettings.groupMultiLayout ?? 'stack';

      // Local folder settings
      if (fieldId === 'lf_autoHashOnSelect') return lf_autoHashOnSelect;
      if (fieldId === 'lf_autoCheckBackend') return lf_autoCheckBackend;
      if (fieldId === 'lf_hashChunkSize') return lf_hashChunkSize;
      if (fieldId === 'lf_previewMode') return lf_previewMode;

      // Server settings
      if (serverSettings && fieldId in serverSettings) {
        return serverSettings[fieldId as keyof ServerMediaSettings];
      }

      return undefined;
    },

    set: (fieldId: string, value: any) => {
      // Similarity checks (backend user preferences)
      if (fieldId.startsWith('similarity.upload.')) {
        const key = fieldId.split('.')[2] as keyof typeof uploadChecks;
        const updated = { ...uploadChecks, [key]: value };
        setUploadChecksLocal(updated);
        updatePreferenceKey('similarityChecks', { upload: updated }).catch((err) => {
          console.error('Failed to save similarityChecks:', err);
          setUploadChecksLocal(uploadChecks); // revert
        });
        return;
      }

      // Asset settings
      if (fieldId === 'downloadOnGenerate') {
        setDownloadOnGenerate(value);
        return;
      }
      if (fieldId === 'deleteFromProvider') {
        setDeleteFromProvider(value);
        return;
      }

      // Gallery settings
      if (fieldId === 'qualityMode') {
        updateGallerySettings({ qualityMode: value as GalleryQualityMode });
        return;
      }
      if (fieldId === 'preferOriginal') {
        updateGallerySettings({ preferOriginal: value as boolean });
        return;
      }

      // Local media settings
      if (fieldId === 'preventDiskCache') {
        setPreventDiskCache(value);
        return;
      }

      // Gallery panel config settings
      if (fieldId === 'groupMultiLayout') {
        updatePanelSettings('gallery', { groupMultiLayout: value as GalleryGroupMultiLayout });
        return;
      }

      // Local folder settings
      if (fieldId === 'lf_autoHashOnSelect') {
        setLfAutoHashOnSelect(value);
        return;
      }
      if (fieldId === 'lf_autoCheckBackend') {
        setLfAutoCheckBackend(value);
        return;
      }
      if (fieldId === 'lf_hashChunkSize') {
        setLfHashChunkSize(value);
        return;
      }
      if (fieldId === 'lf_previewMode') {
        setLfPreviewMode(value);
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
      'similarity.upload.sha256': uploadChecks.sha256,
      'similarity.upload.phash': uploadChecks.phash,
      'similarity.upload.phashThreshold': uploadChecks.phashThreshold,
      downloadOnGenerate,
      deleteFromProvider,
      qualityMode,
      preferOriginal,
      preventDiskCache,
      groupMultiLayout: gallerySettings.groupMultiLayout ?? 'stack',
      lf_autoHashOnSelect,
      lf_autoCheckBackend,
      lf_hashChunkSize,
      lf_previewMode,
      ...(serverSettings ?? {}),
    }),
  };
}

// =============================================================================
// Registration
// =============================================================================
export function registerLibrarySettings(): () => void {
  // Register each tab separately
  const unregister1 = settingsSchemaRegistry.register({
    categoryId: 'library',
    category: {
      label: 'Library',
      icon: '📚',
      order: 35, // Same position as old Assets
    },
    tab: displayTab,
    useStore: useLibrarySettingsStoreAdapter,
  });

  const unregister2 = settingsSchemaRegistry.register({
    categoryId: 'library',
    tab: downloadsTab,
    useStore: useLibrarySettingsStoreAdapter,
  });

  const unregister3 = settingsSchemaRegistry.register({
    categoryId: 'library',
    tab: storageTab,
    useStore: useLibrarySettingsStoreAdapter,
  });

  const unregister4 = settingsSchemaRegistry.register({
    categoryId: 'library',
    tab: hashingTab,
    useStore: useLibrarySettingsStoreAdapter,
  });

  const unregister5 = settingsSchemaRegistry.register({
    categoryId: 'library',
    tab: maintenanceTab,
    useStore: useLibrarySettingsStoreAdapter,
  });

  return () => {
    unregister1();
    unregister2();
    unregister3();
    unregister4();
    unregister5();
  };
}
