import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AssetSettingsState {
  downloadOnGenerate: boolean;
  deleteFromProvider: boolean;
  setDownloadOnGenerate: (value: boolean) => void;
  setDeleteFromProvider: (value: boolean) => void;
}

export const useAssetSettingsStore = create<AssetSettingsState>()(
  persist(
    (set) => ({
      downloadOnGenerate: false,
      deleteFromProvider: true,
      setDownloadOnGenerate: (value) => set({ downloadOnGenerate: value }),
      setDeleteFromProvider: (value) => set({ deleteFromProvider: value }),
    }),
    {
      name: 'asset_settings_v1',
      partialize: (state) => ({
        downloadOnGenerate: state.downloadOnGenerate,
        deleteFromProvider: state.deleteFromProvider,
      }),
    }
  )
);
