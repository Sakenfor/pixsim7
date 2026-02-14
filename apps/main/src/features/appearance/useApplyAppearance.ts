import { useEffect } from 'react';

import { useAppearanceStore, type ColorScheme } from './stores/appearanceStore';

const ACCENT_CLASSES = ['accent-purple', 'accent-emerald', 'accent-rose', 'accent-amber'] as const;

/**
 * Resolves the effective dark/light theme from a color scheme setting.
 */
function resolveIsDark(scheme: ColorScheme): boolean {
  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Applies appearance settings to the DOM.
 * Replaces both `useTheme()` (from shared.ui) and `useApplyTheme()`.
 * Call once from the app root.
 */
export function useApplyAppearance() {
  const colorScheme = useAppearanceStore((s) => s.colorScheme);
  const accentColor = useAppearanceStore((s) => s.accentColor);

  // ── Color scheme → .dark class + localStorage sync ──────────────────────
  useEffect(() => {
    const root = document.documentElement;

    function apply() {
      const isDark = resolveIsDark(colorScheme);
      root.classList.toggle('dark', isDark);
      // Sync to legacy key so shared.ui's useTheme() (used by devtools) stays compatible
      localStorage.setItem('pixsim7:theme', isDark ? 'dark' : 'light');
    }

    apply();

    // For 'system' mode, listen for OS preference changes
    if (colorScheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [colorScheme]);

  // ── Accent color → .accent-* class ─────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...ACCENT_CLASSES);
    if (accentColor !== 'blue') {
      root.classList.add(`accent-${accentColor}`);
    }
  }, [accentColor]);
}
