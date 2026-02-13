import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * How local folder image previews are loaded in the gallery.
 * - 'thumbnail': Generate 400px cached thumbnails (default, lower memory)
 * - 'original': Show original files directly via blob URL (fastest load, more memory)
 * - 'gallery-settings': Follow the main Gallery Quality settings (qualityMode / preferOriginal)
 */
export type LocalPreviewMode = 'thumbnail' | 'original' | 'gallery-settings';

export interface LocalFolderSettingsState {
  /** Auto-hash assets when selecting a folder in the tree */
  autoHashOnSelect: boolean;
  /** Auto-check hashes against backend for "already in library" detection */
  autoCheckBackend: boolean;
  /** Number of files to process per hashing batch before yielding */
  hashChunkSize: number;
  /** Selected provider ID for uploads */
  providerId: string | undefined;
  /** Favorite folder paths (persisted) */
  favoriteFolders: string[];
  /** How local image previews are loaded */
  previewMode: LocalPreviewMode;

  setAutoHashOnSelect: (value: boolean) => void;
  setAutoCheckBackend: (value: boolean) => void;
  setHashChunkSize: (value: number) => void;
  setProviderId: (value: string | undefined) => void;
  toggleFavoriteFolder: (path: string) => void;
  isFavoriteFolder: (path: string) => boolean;
  setPreviewMode: (value: LocalPreviewMode) => void;
}

export const useLocalFolderSettingsStore = create<LocalFolderSettingsState>()(
  persist(
    (set, get) => ({
      autoHashOnSelect: true,
      autoCheckBackend: true,
      hashChunkSize: 3,
      providerId: undefined,
      favoriteFolders: [],
      previewMode: 'thumbnail',

      setAutoHashOnSelect: (value) => set({ autoHashOnSelect: value }),
      setAutoCheckBackend: (value) => set({ autoCheckBackend: value }),
      setHashChunkSize: (value) => set({ hashChunkSize: value }),
      setProviderId: (value) => set({ providerId: value }),
      setPreviewMode: (value) => set({ previewMode: value }),
      toggleFavoriteFolder: (path) => {
        const current = get().favoriteFolders;
        const next = current.includes(path)
          ? current.filter((p) => p !== path)
          : [...current, path];
        set({ favoriteFolders: next });
      },
      isFavoriteFolder: (path) => get().favoriteFolders.includes(path),
    }),
    {
      name: 'local_folder_settings_v1',
      partialize: (state) => ({
        autoHashOnSelect: state.autoHashOnSelect,
        autoCheckBackend: state.autoCheckBackend,
        hashChunkSize: state.hashChunkSize,
        providerId: state.providerId,
        favoriteFolders: state.favoriteFolders,
        previewMode: state.previewMode,
      }),
    }
  )
);
