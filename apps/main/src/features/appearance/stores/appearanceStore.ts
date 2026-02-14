import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'purple' | 'emerald' | 'rose' | 'amber';
export type IconTheme = 'inherit' | 'muted' | 'accent';

interface AppearanceState {
  colorScheme: ColorScheme;
  accentColor: AccentColor;
  iconTheme: IconTheme;
  iconSetId: string;
  setColorScheme: (value: ColorScheme) => void;
  setAccentColor: (value: AccentColor) => void;
  setIconTheme: (value: IconTheme) => void;
  setIconSetId: (value: string) => void;
}

// ─── Migration from legacy keys ─────────────────────────────────────────────

function migrateLegacySettings(): Partial<Pick<AppearanceState, 'colorScheme' | 'accentColor' | 'iconTheme' | 'iconSetId'>> {
  const migrated: Partial<Pick<AppearanceState, 'colorScheme' | 'accentColor' | 'iconTheme' | 'iconSetId'>> = {};

  // pixsim7:theme → colorScheme
  try {
    const savedTheme = localStorage.getItem('pixsim7:theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      migrated.colorScheme = savedTheme;
    }
  } catch { /* ignore */ }

  // theme_settings_v1 → accentColor
  try {
    const raw = localStorage.getItem('theme_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const accent = parsed?.state?.accentColor;
      if (accent && ['blue', 'purple', 'emerald', 'rose', 'amber'].includes(accent)) {
        migrated.accentColor = accent as AccentColor;
      }
    }
  } catch { /* ignore */ }

  // icon_settings_v1 → iconTheme, iconSetId
  try {
    const raw = localStorage.getItem('icon_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const theme = parsed?.state?.iconTheme;
      const setId = parsed?.state?.iconSetId;
      if (theme && ['inherit', 'muted', 'accent'].includes(theme)) {
        migrated.iconTheme = theme as IconTheme;
      }
      if (typeof setId === 'string' && setId.length > 0) {
        migrated.iconSetId = setId;
      }
    }
  } catch { /* ignore */ }

  return migrated;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      colorScheme: 'system',
      accentColor: 'blue',
      iconTheme: 'inherit',
      iconSetId: 'outline',
      setColorScheme: (colorScheme) => set({ colorScheme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setIconTheme: (iconTheme) => set({ iconTheme }),
      setIconSetId: (iconSetId) => set({ iconSetId }),
    }),
    {
      name: 'appearance_v1',
      // On first hydration, merge legacy values
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Only migrate if this is a fresh store (no previous appearance_v1 in LS)
        const existing = localStorage.getItem('appearance_v1');
        if (existing) return; // Already have our own data — no migration needed

        const legacy = migrateLegacySettings();
        if (Object.keys(legacy).length > 0) {
          // Apply migrated values
          useAppearanceStore.setState(legacy);
        }
      },
    },
  ),
);

// ─── Flash-prevention side effect ───────────────────────────────────────────
// Runs synchronously on module load (before React mounts) to apply .dark class.
// This prevents the white flash that would occur if we waited for React hydration.

(function applyDarkClassSync() {
  if (typeof window === 'undefined') return;

  let isDark = false;

  try {
    const raw = localStorage.getItem('appearance_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const scheme = parsed?.state?.colorScheme;
      if (scheme === 'dark') {
        isDark = true;
      } else if (scheme === 'light') {
        isDark = false;
      } else {
        // 'system' or missing
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } else {
      // No appearance_v1 key yet — check legacy key
      const legacy = localStorage.getItem('pixsim7:theme');
      if (legacy === 'dark') {
        isDark = true;
      } else if (legacy === 'light') {
        isDark = false;
      } else {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    }
  } catch {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  document.documentElement.classList.toggle('dark', isDark);
})();
