/**
 * Session UI Theme Override Management
 *
 * Provides APIs for applying temporary theme overrides during gameplay
 * for special moments like dream sequences, flashbacks, dramatic beats, etc.
 *
 * Overrides are stored in session flags and do NOT permanently modify world meta.
 */

import type {
  GameSessionDTO,
  SessionUiOverride,
  WorldUiTheme,
  SessionFlags
} from '@pixsim7/types';

/**
 * Pre-defined theme override presets for common scenarios
 */
export const SESSION_OVERRIDE_PRESETS: Record<string, Partial<WorldUiTheme>> = {
  'dream-sequence': {
    colors: {
      primary: '#9333ea',
      secondary: '#ec4899',
      background: '#1e1b4b',
      text: '#e9d5ff',
    },
    motion: 'calm',
  },
  'flashback': {
    colors: {
      primary: '#78716c',
      secondary: '#a8a29e',
      background: '#fafaf9',
      text: '#1c1917',
    },
    motion: 'calm',
  },
  'nightmare': {
    colors: {
      primary: '#dc2626',
      secondary: '#991b1b',
      background: '#0c0a09',
      text: '#fca5a5',
    },
    motion: 'snappy',
  },
  'tense-moment': {
    colors: {
      primary: '#ea580c',
      secondary: '#dc2626',
      background: '#1c1917',
      text: '#fed7aa',
    },
    motion: 'snappy',
  },
  'peaceful': {
    colors: {
      primary: '#10b981',
      secondary: '#6ee7b7',
      background: '#ecfdf5',
      text: '#064e3b',
    },
    motion: 'calm',
  },
};

/**
 * Apply a session theme override
 * Returns updated session with override in flags.ui
 */
export function applySessionOverride(
  session: GameSessionDTO,
  override: SessionUiOverride
): GameSessionDTO {
  const flags = session.flags as SessionFlags;

  return {
    ...session,
    flags: {
      ...flags,
      ui: {
        ...override,
        appliedAt: override.appliedAt || Date.now(),
      },
    },
  };
}

/**
 * Apply a preset session override by name
 */
export function applySessionOverridePreset(
  session: GameSessionDTO,
  presetId: string,
  metadata?: SessionUiOverride['metadata']
): GameSessionDTO {
  const preset = SESSION_OVERRIDE_PRESETS[presetId];
  if (!preset) {
    console.warn(`Unknown session override preset: ${presetId}`);
    return session;
  }

  const override: SessionUiOverride = {
    id: presetId,
    themeOverride: preset,
    metadata: {
      ...metadata,
      reason: metadata?.reason || `Applied preset: ${presetId}`,
    },
  };

  return applySessionOverride(session, override);
}

/**
 * Clear session theme override
 * Returns session with ui override removed from flags
 */
export function clearSessionOverride(session: GameSessionDTO): GameSessionDTO {
  const flags = session.flags as SessionFlags;
  const { ui, ...restFlags } = flags;

  return {
    ...session,
    flags: restFlags,
  };
}

/**
 * Get current session override if any
 */
export function getSessionOverride(session: GameSessionDTO): SessionUiOverride | undefined {
  const flags = session.flags as SessionFlags;
  return flags.ui;
}

/**
 * Check if session has an active override
 */
export function hasSessionOverride(session: GameSessionDTO): boolean {
  return getSessionOverride(session) !== undefined;
}

/**
 * Merge world theme with session override
 * Returns a new theme that combines both, with override taking precedence
 */
export function mergeThemeWithOverride(
  baseTheme: WorldUiTheme | undefined,
  override: SessionUiOverride | undefined
): WorldUiTheme | undefined {
  if (!override || !override.themeOverride) {
    return baseTheme;
  }

  if (!baseTheme) {
    // If no base theme, create one from override
    return {
      id: override.id,
      ...override.themeOverride,
    } as WorldUiTheme;
  }

  // Merge colors
  const mergedColors = {
    ...(baseTheme.colors || {}),
    ...(override.themeOverride.colors || {}),
  };

  return {
    ...baseTheme,
    ...override.themeOverride,
    id: `${baseTheme.id}+${override.id}`,
    colors: Object.keys(mergedColors).length > 0 ? mergedColors : undefined,
  };
}

/**
 * Get all available preset IDs
 */
export function getSessionOverridePresetIds(): string[] {
  return Object.keys(SESSION_OVERRIDE_PRESETS);
}

/**
 * Get a preset by ID
 */
export function getSessionOverridePreset(presetId: string): Partial<WorldUiTheme> | undefined {
  return SESSION_OVERRIDE_PRESETS[presetId];
}
