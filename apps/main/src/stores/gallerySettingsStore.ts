import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GalleryQualityMode = 'thumbnail' | 'preview' | 'auto';

interface GallerySettingsState {
  qualityMode: GalleryQualityMode;
  setQualityMode: (mode: GalleryQualityMode) => void;
}

export const useGallerySettingsStore = create<GallerySettingsState>()(
  persist(
    (set) => ({
      qualityMode: 'auto',
      setQualityMode: (mode) => set({ qualityMode: mode }),
    }),
    {
      name: 'gallery-settings',
    }
  )
);
