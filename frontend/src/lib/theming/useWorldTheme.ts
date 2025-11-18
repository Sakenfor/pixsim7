/**
 * useWorldTheme Hook
 *
 * React hook for applying per-world UI themes.
 * Reads theme configuration from GameWorld.meta.ui and applies CSS variables.
 */

import { useEffect } from 'react';
import type { GameWorldDetail, WorldUiTheme } from '@pixsim7/types';
import { getWorldTheme } from '@pixsim7/game-core';

/**
 * Apply a theme by setting CSS variables on the document root
 */
function applyTheme(theme: WorldUiTheme | undefined) {
  const root = document.documentElement;

  // Clear existing world theme variables
  root.style.removeProperty('--world-theme-primary');
  root.style.removeProperty('--world-theme-secondary');
  root.style.removeProperty('--world-theme-background');
  root.style.removeProperty('--world-theme-text');
  root.classList.remove('world-theme-compact', 'world-theme-comfortable', 'world-theme-spacious');

  if (!theme) {
    return;
  }

  // Apply theme colors as CSS variables
  if (theme.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--world-theme-${key}`, value);
    });
  }

  // Apply density class
  if (theme.density) {
    root.classList.add(`world-theme-${theme.density}`);
  }

  console.debug(`[WorldTheme] Applied theme: ${theme.id}`, theme);
}

/**
 * React hook to automatically apply world theme when world changes
 */
export function useWorldTheme(worldDetail: GameWorldDetail | null) {
  useEffect(() => {
    if (!worldDetail) {
      // No world selected - clear theme
      applyTheme(undefined);
      return;
    }

    // Get theme from world meta
    const theme = getWorldTheme(worldDetail);
    applyTheme(theme);

    // Cleanup on unmount or world change
    return () => {
      applyTheme(undefined);
    };
  }, [worldDetail]);
}

/**
 * Generate theme CSS for injection (alternative approach)
 */
export function generateThemeCSS(theme: WorldUiTheme | undefined): string {
  if (!theme || !theme.colors) {
    return '';
  }

  const cssVars = Object.entries(theme.colors)
    .map(([key, value]) => `  --world-theme-${key}: ${value};`)
    .join('\n');

  let densityRules = '';
  if (theme.density) {
    const densityMap = {
      compact: '0.875rem',
      comfortable: '1rem',
      spacious: '1.25rem',
    };
    const fontSize = densityMap[theme.density];
    densityRules = `\n\n.world-theme-${theme.density} {\n  font-size: ${fontSize};\n}`;
  }

  return `:root {\n${cssVars}\n}${densityRules}`;
}
