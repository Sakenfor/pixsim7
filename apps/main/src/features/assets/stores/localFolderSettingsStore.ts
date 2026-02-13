import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LocalFolderSettingsState {
  /** Auto-hash assets when selecting a folder in the tree */
  autoHashOnSelect: boolean;
  /** Auto-check hashes against backend for "already in library" detection */
  autoCheckBackend: boolean;
  /** Number of files to hash concurrently per chunk */
  hashChunkSize: number;

  setAutoHashOnSelect: (value: boolean) => void;
  setAutoCheckBackend: (value: boolean) => void;
  setHashChunkSize: (value: number) => void;
}

export const useLocalFolderSettingsStore = create<LocalFolderSettingsState>()(
  persist(
    (set) => ({
      autoHashOnSelect: true,
      autoCheckBackend: true,
      hashChunkSize: 3,

      setAutoHashOnSelect: (value) => set({ autoHashOnSelect: value }),
      setAutoCheckBackend: (value) => set({ autoCheckBackend: value }),
      setHashChunkSize: (value) => set({ hashChunkSize: value }),
    }),
    {
      name: 'local_folder_settings_v1',
      partialize: (state) => ({
        autoHashOnSelect: state.autoHashOnSelect,
        autoCheckBackend: state.autoCheckBackend,
        hashChunkSize: state.hashChunkSize,
      }),
    }
  )
);
