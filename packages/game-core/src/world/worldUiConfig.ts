/**
 * World UI Configuration
 *
 * Utilities for reading and writing per-world UI theme and view mode configuration
 * stored in GameWorld.meta.ui (nested under a 'ui' key).
 */

import type { GameWorldDetail, WorldUiConfig, WorldUiTheme, ViewMode, MotionPreset, MotionConfig } from '@pixsim7/types';

/**
 * Built-in motion presets with their configurations
 */
export const MOTION_PRESETS: Record<MotionPreset, MotionConfig> = {
  none: {
    duration: 0,
    easing: 'linear',
    respectReducedMotion: true,
  },
  calm: {
    duration: 400,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // ease-in-out
    respectReducedMotion: true,
  },
  comfortable: {
    duration: 250,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)', // ease-in-out
    respectReducedMotion: true,
  },
  snappy: {
    duration: 150,
    easing: 'cubic-bezier(0.4, 0, 0.6, 1)', // Custom snappy curve
    respectReducedMotion: true,
  },
};

/**
 * Predefined theme presets
 */
export const THEME_PRESETS: Record<string, WorldUiTheme> = {
  default: {
    id: 'default',
    colors: {},
    density: 'comfortable',
    motion: 'comfortable',
  },
  'neo-noir': {
    id: 'neo-noir',
    colors: {
      primary: '#00f3ff',
      secondary: '#ff00e5',
      background: '#0a0a0f',
      text: '#e0e0e0',
    },
    density: 'compact',
    motion: 'snappy',
  },
  'bright-minimal': {
    id: 'bright-minimal',
    colors: {
      primary: '#6366f1',
      secondary: '#ec4899',
      background: '#ffffff',
      text: '#1f2937',
    },
    density: 'spacious',
    motion: 'calm',
  },
  'fantasy-rpg': {
    id: 'fantasy-rpg',
    colors: {
      primary: '#d97706',
      secondary: '#059669',
      background: '#1c1917',
      text: '#fef3c7',
    },
    density: 'comfortable',
    motion: 'comfortable',
  },
};

/**
 * Get the world UI configuration from GameWorld.meta.ui
 * Returns empty object if no UI config is set
 */
export function getWorldUiConfig(world: GameWorldDetail): WorldUiConfig {
  if (!world.meta) {
    return {};
  }
  // The UI config is stored under meta.ui key
  const meta = world.meta as any;
  return (meta.ui as WorldUiConfig) || {};
}

/**
 * Set/update the world UI configuration in GameWorld.meta.ui
 * Preserves other meta fields (e.g., manifest, npcRoles)
 * Returns a new GameWorldDetail with updated UI config
 */
export function setWorldUiConfig(
  world: GameWorldDetail,
  uiConfig: WorldUiConfig
): GameWorldDetail {
  return {
    ...world,
    meta: {
      ...(world.meta || {}),
      ui: uiConfig,
    },
  };
}

/**
 * Update specific UI config properties while preserving others
 * Returns a new GameWorldDetail with merged UI config
 */
export function updateWorldUiConfig(
  world: GameWorldDetail,
  updates: Partial<WorldUiConfig>
): GameWorldDetail {
  const currentConfig = getWorldUiConfig(world);
  return setWorldUiConfig(world, {
    ...currentConfig,
    ...updates,
  });
}

/**
 * Get the theme from world UI config
 * Returns undefined if not set
 */
export function getWorldTheme(world: GameWorldDetail): WorldUiTheme | undefined {
  const config = getWorldUiConfig(world);
  return config.theme;
}

/**
 * Set the theme in world UI config
 * Returns a new GameWorldDetail with updated theme
 */
export function setWorldTheme(
  world: GameWorldDetail,
  theme: WorldUiTheme
): GameWorldDetail {
  return updateWorldUiConfig(world, { theme });
}

/**
 * Get the view mode from world UI config
 * Returns undefined if not set (defaults to 'hud-heavy' in practice)
 */
export function getWorldViewMode(world: GameWorldDetail): ViewMode | undefined {
  const config = getWorldUiConfig(world);
  return config.viewMode;
}

/**
 * Set the view mode in world UI config
 * Returns a new GameWorldDetail with updated view mode
 */
export function setWorldViewMode(
  world: GameWorldDetail,
  viewMode: ViewMode
): GameWorldDetail {
  return updateWorldUiConfig(world, { viewMode });
}

/**
 * Get a theme preset by ID
 * Returns undefined if preset doesn't exist
 */
export function getThemePreset(presetId: string): WorldUiTheme | undefined {
  return THEME_PRESETS[presetId];
}

/**
 * Get all available theme preset IDs
 */
export function getThemePresetIds(): string[] {
  return Object.keys(THEME_PRESETS);
}

/**
 * Create a default world UI config with sensible defaults
 */
export function createDefaultWorldUiConfig(): WorldUiConfig {
  return {
    theme: THEME_PRESETS.default,
    viewMode: 'hud-heavy',
  };
}

/**
 * Check if a world has a custom theme configured
 */
export function hasCustomTheme(world: GameWorldDetail): boolean {
  const theme = getWorldTheme(world);
  return theme !== undefined && theme.id !== 'default';
}

/**
 * Reset world UI config to defaults
 * Returns a new GameWorldDetail with default UI config
 */
export function resetWorldUiConfig(world: GameWorldDetail): GameWorldDetail {
  return setWorldUiConfig(world, createDefaultWorldUiConfig());
}

/**
 * Resolve motion configuration from theme
 * Converts preset names to MotionConfig or returns custom config
 */
export function resolveMotionConfig(motion?: MotionPreset | MotionConfig): MotionConfig {
  if (!motion) {
    // Default to comfortable preset
    return MOTION_PRESETS.comfortable;
  }

  if (typeof motion === 'string') {
    // It's a preset name
    return MOTION_PRESETS[motion] || MOTION_PRESETS.comfortable;
  }

  // It's a custom MotionConfig
  return {
    duration: motion.duration ?? MOTION_PRESETS.comfortable.duration,
    easing: motion.easing ?? MOTION_PRESETS.comfortable.easing,
    respectReducedMotion: motion.respectReducedMotion ?? true,
  };
}

/**
 * Get motion configuration from a world theme
 */
export function getMotionConfig(world: GameWorldDetail): MotionConfig {
  const theme = getWorldTheme(world);
  return resolveMotionConfig(theme?.motion);
}

/**
 * Get all available motion preset names
 */
export function getMotionPresetNames(): MotionPreset[] {
  return Object.keys(MOTION_PRESETS) as MotionPreset[];
}
