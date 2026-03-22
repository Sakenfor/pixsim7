import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AssetSettingsState {
  deleteFromProvider: boolean;
  setDeleteFromProvider: (value: boolean) => void;
}

export const useAssetSettingsStore = create<AssetSettingsState>()(
  persist(
    (set) => ({
      deleteFromProvider: true,
      setDeleteFromProvider: (value) => set({ deleteFromProvider: value }),
    }),
    {
      name: 'asset_settings_v1',
      partialize: (state) => ({
        deleteFromProvider: state.deleteFromProvider,
      }),
    }
  )
);
