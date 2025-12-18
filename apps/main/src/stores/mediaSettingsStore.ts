/**
 * Media Settings Store
 *
 * Persisted settings for media display behavior, particularly
 * around caching and performance trade-offs.
 *
 * Combines:
 * - Local settings (persisted in localStorage)
 * - Server settings (fetched from backend API)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Server-side media settings (from backend)
export interface ServerMediaSettings {
  ingest_on_asset_add: boolean;
  prefer_local_over_provider: boolean;
  cache_control_max_age_seconds: number;
  generate_thumbnails: boolean;
  generate_video_previews: boolean;
  max_download_size_mb: number;
  concurrency_limit: number;
  thumbnail_size: [number, number];
  preview_size: [number, number];
}

interface MediaSettingsState {
  // === Local settings (persisted in browser) ===
  /**
   * When true, external thumbnail URLs are fetched and converted to blob URLs.
   * This prevents Chrome from caching media on disk (C: drive), trading
   * disk space for memory usage.
   */
  preventDiskCache: boolean;
  setPreventDiskCache: (value: boolean) => void;

  // === Server settings (fetched from backend) ===
  serverSettings: ServerMediaSettings | null;
  serverSettingsLoading: boolean;
  serverSettingsError: string | null;

  // Actions for server settings
  setServerSettings: (settings: ServerMediaSettings) => void;
  setServerSettingsLoading: (loading: boolean) => void;
  setServerSettingsError: (error: string | null) => void;
  updateServerSetting: <K extends keyof ServerMediaSettings>(
    key: K,
    value: ServerMediaSettings[K]
  ) => void;
}

const STORAGE_KEY = 'media_settings_v1';

// Default server settings (used before fetch completes)
const DEFAULT_SERVER_SETTINGS: ServerMediaSettings = {
  ingest_on_asset_add: true,
  prefer_local_over_provider: true,
  cache_control_max_age_seconds: 86400,
  generate_thumbnails: true,
  generate_video_previews: false,
  max_download_size_mb: 500,
  concurrency_limit: 4,
  thumbnail_size: [256, 256],
  preview_size: [800, 800],
};

export const useMediaSettingsStore = create<MediaSettingsState>()(
  persist(
    (set, get) => ({
      // Local settings
      preventDiskCache: false,
      setPreventDiskCache: (value) => {
        set({ preventDiskCache: value });
        // Also set window global for immediate effect on existing hooks
        if (typeof window !== 'undefined') {
          (window as unknown as { __PIXSIM_USE_BLOB_THUMBNAILS?: boolean }).__PIXSIM_USE_BLOB_THUMBNAILS = value;
        }
      },

      // Server settings
      serverSettings: null,
      serverSettingsLoading: false,
      serverSettingsError: null,

      setServerSettings: (settings) => {
        set({ serverSettings: settings, serverSettingsError: null });
      },

      setServerSettingsLoading: (loading) => {
        set({ serverSettingsLoading: loading });
      },

      setServerSettingsError: (error) => {
        set({ serverSettingsError: error });
      },

      updateServerSetting: (key, value) => {
        const current = get().serverSettings;
        if (current) {
          set({
            serverSettings: { ...current, [key]: value },
          });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        preventDiskCache: state.preventDiskCache,
        // Don't persist server settings - always fetch fresh
      }),
      onRehydrateStorage: () => (state) => {
        // Sync window global when store rehydrates
        if (state && typeof window !== 'undefined') {
          (window as unknown as { __PIXSIM_USE_BLOB_THUMBNAILS?: boolean }).__PIXSIM_USE_BLOB_THUMBNAILS = state.preventDiskCache;
        }
      },
    }
  )
);

// Helper to get effective settings (with defaults)
export function getEffectiveServerSettings(): ServerMediaSettings {
  const store = useMediaSettingsStore.getState();
  return store.serverSettings ?? DEFAULT_SERVER_SETTINGS;
}
