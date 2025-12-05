/**
 * Media Settings Store
 *
 * Persisted settings for media display behavior, particularly
 * around caching and performance trade-offs.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MediaSettingsState {
  /**
   * When true, external thumbnail URLs are fetched and converted to blob URLs.
   * This prevents Chrome from caching media on disk (C: drive), trading
   * disk space for memory usage.
   *
   * Useful when:
   * - C: drive has limited space
   * - You want to avoid large Chrome cache buildup
   * - Privacy concerns about cached media
   */
  preventDiskCache: boolean;
  setPreventDiskCache: (value: boolean) => void;
}

const STORAGE_KEY = 'media_settings_v1';

export const useMediaSettingsStore = create<MediaSettingsState>()(
  persist(
    (set) => ({
      preventDiskCache: false,
      setPreventDiskCache: (value) => {
        set({ preventDiskCache: value });
        // Also set window global for immediate effect on existing hooks
        if (typeof window !== 'undefined') {
          (window as unknown as { __PIXSIM_USE_BLOB_THUMBNAILS?: boolean }).__PIXSIM_USE_BLOB_THUMBNAILS = value;
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        preventDiskCache: state.preventDiskCache,
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
