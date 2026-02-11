import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentColor = 'blue' | 'purple' | 'emerald' | 'rose' | 'amber';

interface ThemeState {
  accentColor: AccentColor;
  setAccentColor: (value: AccentColor) => void;
}

export const useThemeSettingsStore = create<ThemeState>()(
  persist(
    (set) => ({
      accentColor: 'blue',
      setAccentColor: (accentColor) => set({ accentColor }),
    }),
    {
      name: 'theme_settings_v1',
    },
  ),
);
