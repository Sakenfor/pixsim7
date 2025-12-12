/**
 * useWorldTheme Hook
 *
 * React hook for applying per-world UI themes.
 * Reads theme configuration from GameWorld.meta.ui and applies CSS variables.
 * Supports session-level theme overrides for special moments.
 */

import { useEffect } from 'react';
import type { GameWorldDetail, WorldUiTheme, UserUiPreferences, SessionUiOverride, GameSessionDTO } from '@/lib/registries';
import {
  getWorldTheme,
  loadUserPreferences,
  isHighContrastEnabled,
  getEffectiveDensity,
  resolveMotionConfig,
  mergeThemeWithOverride,
  getDynamicThemeOverride,
  applyDynamicThemeRule,
  loadDynamicThemeRules,
} from '@pixsim7/game.engine';

/**
 * Apply high contrast adjustments to colors
 */
function applyHighContrastColors(colors: Record<string, string>): Record<string, string> {
  // Simple high contrast transformation:
  // Make colors more saturated and increase contrast
  const adjusted: Record<string, string> = {};

  for (const [key, value] of Object.entries(colors)) {
    // For backgrounds, use pure black or white
    if (key.includes('background')) {
      adjusted[key] = value.includes('fff') || value.includes('white') ? '#ffffff' : '#000000';
    } else {
      // For foreground colors, keep them but ensure they're vivid
      adjusted[key] = value;
    }
  }

  return adjusted;
}

/**
 * Apply a theme by setting CSS variables on the document root
 * Respects user preferences for accessibility
 */
function applyTheme(theme: WorldUiTheme | undefined, userPrefs: UserUiPreferences) {
  const root = document.documentElement;

  // Clear existing world theme variables
  root.style.removeProperty('--world-theme-primary');
  root.style.removeProperty('--world-theme-secondary');
  root.style.removeProperty('--world-theme-background');
  root.style.removeProperty('--world-theme-text');
  root.style.removeProperty('--world-theme-motion-duration');
  root.style.removeProperty('--world-theme-motion-easing');
  root.classList.remove('world-theme-compact', 'world-theme-comfortable', 'world-theme-spacious');
  root.classList.remove('user-high-contrast', 'user-reduced-motion');

  if (!theme) {
    return;
  }

  // Apply theme colors as CSS variables (with high contrast if enabled)
  if (theme.colors) {
    const colors = userPrefs.prefersHighContrast
      ? applyHighContrastColors(theme.colors)
      : theme.colors;

    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--world-theme-${key}`, value);
    });
  }

  // Apply density class (user preference overrides theme)
  const effectiveDensity = getEffectiveDensity(theme.density);
  root.classList.add(`world-theme-${effectiveDensity}`);

  // Apply motion settings as CSS variables
  const motionConfig = resolveMotionConfig(theme.motion);

  // If user prefers reduced motion, override with no animations
  if (userPrefs.prefersReducedMotion && motionConfig.respectReducedMotion) {
    root.style.setProperty('--world-theme-motion-duration', '0ms');
    root.style.setProperty('--world-theme-motion-easing', 'linear');
  } else {
    root.style.setProperty('--world-theme-motion-duration', `${motionConfig.duration}ms`);
    root.style.setProperty('--world-theme-motion-easing', motionConfig.easing || 'ease');
  }

  // Apply user preference classes
  if (userPrefs.prefersHighContrast) {
    root.classList.add('user-high-contrast');
  }

  if (userPrefs.prefersReducedMotion) {
    root.classList.add('user-reduced-motion');
  }

  console.debug(`[WorldTheme] Applied theme: ${theme.id}`, {
    theme,
    userPrefs,
    effectiveDensity,
    motionConfig,
  });
}

/**
 * React hook to automatically apply world theme when world changes
 * Respects user preferences for accessibility
 * Supports session-level theme overrides and dynamic theme rules
 *
 * @param worldDetail - The current world
 * @param session - Optional session (for dynamic theme rules)
 * @param sessionOverride - Optional session theme override (e.g., for dream sequences)
 */
export function useWorldTheme(
  worldDetail: GameWorldDetail | null,
  session?: GameSessionDTO,
  sessionOverride?: SessionUiOverride
) {
  useEffect(() => {
    // Load user preferences
    const userPrefs = loadUserPreferences();

    if (!worldDetail) {
      // No world selected - clear theme but apply user preferences
      applyTheme(undefined, userPrefs);
      return;
    }

    // Get theme from world meta
    let effectiveTheme = getWorldTheme(worldDetail);

    // Apply dynamic theme rules (if enabled)
    const dynamicRules = loadDynamicThemeRules();
    const dynamicOverride = getDynamicThemeOverride(dynamicRules, worldDetail, session);
    if (dynamicOverride) {
      effectiveTheme = applyDynamicThemeRule(effectiveTheme, dynamicOverride);
      console.debug('[WorldTheme] Applied dynamic theme rule', { dynamicOverride });
    }

    // Merge with session override if present (session override takes precedence over dynamic rules)
    effectiveTheme = mergeThemeWithOverride(effectiveTheme, sessionOverride);

    applyTheme(effectiveTheme, userPrefs);

    // Cleanup on unmount or world change
    return () => {
      applyTheme(undefined, userPrefs);
    };
  }, [worldDetail, session, sessionOverride]);
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
