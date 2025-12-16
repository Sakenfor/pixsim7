import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AssetSettingsState {
  downloadOnGenerate: boolean;
  setDownloadOnGenerate: (value: boolean) => void;
}

export const useAssetSettingsStore = create<AssetSettingsState>()(
  persist(
    (set) => ({
      downloadOnGenerate: false,
      setDownloadOnGenerate: (value) => set({ downloadOnGenerate: value }),
    }),
    {
      name: 'asset_settings_v1',
      partialize: (state) => ({
        downloadOnGenerate: state.downloadOnGenerate,
      }),
    }
  )
);
