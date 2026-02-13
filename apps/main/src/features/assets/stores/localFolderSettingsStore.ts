import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LocalFolderSettingsState {
  /** Auto-hash assets when selecting a folder in the tree */
  autoHashOnSelect: boolean;
  /** Auto-check hashes against backend for "already in library" detection */
  autoCheckBackend: boolean;
  /** Number of files to hash concurrently per chunk */
  hashChunkSize: number;
  /** Selected provider ID for uploads */
  providerId: string | undefined;
  /** Favorite folder paths (persisted) */
  favoriteFolders: string[];

  setAutoHashOnSelect: (value: boolean) => void;
  setAutoCheckBackend: (value: boolean) => void;
  setHashChunkSize: (value: number) => void;
  setProviderId: (value: string | undefined) => void;
  toggleFavoriteFolder: (path: string) => void;
  isFavoriteFolder: (path: string) => boolean;
}

export const useLocalFolderSettingsStore = create<LocalFolderSettingsState>()(
  persist(
    (set, get) => ({
      autoHashOnSelect: true,
      autoCheckBackend: true,
      hashChunkSize: 3,
      providerId: undefined,
      favoriteFolders: [],

      setAutoHashOnSelect: (value) => set({ autoHashOnSelect: value }),
      setAutoCheckBackend: (value) => set({ autoCheckBackend: value }),
      setHashChunkSize: (value) => set({ hashChunkSize: value }),
      setProviderId: (value) => set({ providerId: value }),
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
      }),
    }
  )
);
