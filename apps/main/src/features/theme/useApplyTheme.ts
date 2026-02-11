import { useEffect } from 'react';

import { useThemeSettingsStore } from './stores/themeStore';

const ACCENT_CLASSES = ['accent-purple', 'accent-emerald', 'accent-rose', 'accent-amber'] as const;

/**
 * Applies the selected accent color as a CSS class on <html>.
 * Call once from the app root.
 */
export function useApplyTheme() {
  const accentColor = useThemeSettingsStore((s) => s.accentColor);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all accent classes
    root.classList.remove(...ACCENT_CLASSES);
    // Add the selected accent class (blue is the default, no class needed)
    if (accentColor !== 'blue') {
      root.classList.add(`accent-${accentColor}`);
    }
  }, [accentColor]);
}
