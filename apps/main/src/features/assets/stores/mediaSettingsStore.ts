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
import type { MediaSettings as GeneratedMediaSettings } from '@pixsim7/shared.api.model';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Server-side media settings — derived from backend MediaSettings (Pydantic BaseModel).
// Required<> because the backend always returns all fields with defaults,
// even though the OpenAPI schema marks them optional (due to Pydantic defaults).
export type ServerMediaSettings = Required<GeneratedMediaSettings>;

interface MediaSettingsState {
  // === Local settings (persisted in browser) ===
  /**
   * When true, external thumbnail URLs are fetched and converted to blob URLs.
   * This prevents Chrome from caching media on disk (C: drive), trading
   * disk space for memory usage.
   */
  preventDiskCache: boolean;
  setPreventDiskCache: (value: boolean) => void;
  /** Default threshold used by "Similar content" visual search actions. */
  visualSimilarityThreshold: number;
  setVisualSimilarityThreshold: (value: number) => void;

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
      visualSimilarityThreshold: 0.3,
      setVisualSimilarityThreshold: (value) => {
        const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.3));
        set({ visualSimilarityThreshold: clamped });
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
        visualSimilarityThreshold: state.visualSimilarityThreshold,
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

