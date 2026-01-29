import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type IconTheme = 'inherit' | 'muted' | 'accent';

interface IconSettingsState {
  iconTheme: IconTheme;
  iconSetId: string;
  setIconTheme: (value: IconTheme) => void;
  setIconSetId: (value: string) => void;
}

export const useIconSettingsStore = create<IconSettingsState>()(
  persist(
    (set) => ({
      iconTheme: 'inherit',
      iconSetId: 'outline',
      setIconTheme: (iconTheme) => set({ iconTheme }),
      setIconSetId: (iconSetId) => set({ iconSetId }),
    }),
    {
      name: 'icon_settings_v1',
    },
  ),
);
