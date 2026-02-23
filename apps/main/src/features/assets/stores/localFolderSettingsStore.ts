import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { GroupSortKey } from '../components/groupHelpers';
import type { LocalGroupBy } from '../lib/localGroupEngine';

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
  /** Active grouping dimension, or 'none' for flat view */
  localGroupBy: LocalGroupBy | 'none';
  /** Group overview display mode */
  localGroupView: 'folders' | 'inline';
  /** Sort order for groups */
  localGroupSort: GroupSortKey;
  /** Favorited group composite keys (persisted) */
  favoriteGroups: string[];

  setAutoHashOnSelect: (value: boolean) => void;
  setAutoCheckBackend: (value: boolean) => void;
  setHashChunkSize: (value: number) => void;
  setProviderId: (value: string | undefined) => void;
  toggleFavoriteFolder: (path: string) => void;
  isFavoriteFolder: (path: string) => boolean;
  setPreviewMode: (value: LocalPreviewMode) => void;
  setLocalGroupBy: (value: LocalGroupBy | 'none') => void;
  setLocalGroupView: (value: 'folders' | 'inline') => void;
  setLocalGroupSort: (value: GroupSortKey) => void;
  toggleFavoriteGroup: (compositeKey: string) => void;
  isFavoriteGroup: (compositeKey: string) => boolean;
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
      localGroupBy: 'none',
      localGroupView: 'folders',
      localGroupSort: 'name',
      favoriteGroups: [],

      setAutoHashOnSelect: (value) => set({ autoHashOnSelect: value }),
      setAutoCheckBackend: (value) => set({ autoCheckBackend: value }),
      setHashChunkSize: (value) => set({ hashChunkSize: value }),
      setProviderId: (value) => set({ providerId: value }),
      setPreviewMode: (value) => set({ previewMode: value }),
      setLocalGroupBy: (value) => set({ localGroupBy: value }),
      setLocalGroupView: (value) => set({ localGroupView: value }),
      setLocalGroupSort: (value) => set({ localGroupSort: value }),
      toggleFavoriteFolder: (path) => {
        const current = get().favoriteFolders;
        const next = current.includes(path)
          ? current.filter((p) => p !== path)
          : [...current, path];
        set({ favoriteFolders: next });
      },
      isFavoriteFolder: (path) => get().favoriteFolders.includes(path),
      toggleFavoriteGroup: (compositeKey) => {
        const current = get().favoriteGroups;
        const next = current.includes(compositeKey)
          ? current.filter((k) => k !== compositeKey)
          : [...current, compositeKey];
        set({ favoriteGroups: next });
      },
      isFavoriteGroup: (compositeKey) => get().favoriteGroups.includes(compositeKey),
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
        localGroupBy: state.localGroupBy,
        localGroupView: state.localGroupView,
        localGroupSort: state.localGroupSort,
        favoriteGroups: state.favoriteGroups,
      }),
    }
  )
);
