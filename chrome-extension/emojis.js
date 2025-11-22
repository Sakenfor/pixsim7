/**
 * Centralized emoji constants for PixSim7 Chrome Extension
 *
 * This file contains all emojis used across the extension UI for:
 * - Consistent visual language
 * - Easy updates and modifications
 * - Better maintainability
 *
 * Usage:
 *   import { EMOJI } from './emojis.js';
 *   element.textContent = `${EMOJI.CHECK} Success!`;
 */

export const EMOJI = {
  // Status & Feedback
  CHECK: '✓',
  CHECK_MARK: '✅',
  CROSS: '✗',
  ERROR: '❌',
  WARNING: '⚠️',

  // Actions
  PLAY: '▶️',
  PAUSE: '⏸️',
  STOP: '⏹️',
  REFRESH: '🔄',
  DOWNLOAD: '⬇️',
  UPLOAD: '⬆️',
  IMPORT: '📥',
  EXPORT: '📤',

  // Media & Content
  ART: '🎨',
  CAMERA: '🎬',
  VIDEO: '🎥',
  FILM: '📹',

  // Navigation & Web
  GLOBE: '🌐',
  LINK: '🔗',
  ARROW_RIGHT: '➡️',

  // Files & Storage
  SAVE: '💾',
  FOLDER: '📁',
  FILE: '📄',
  DOCUMENT: '📝',
  TRASH: '🗑️',

  // UI Elements
  STAR: '⭐',
  BELL: '🔔',
  LIGHTBULB: '💡',
  TARGET: '🎯',
  PIN: '📌',
  ROCKET: '🚀',

  // Security & Users
  LOCK: '🔒',
  UNLOCK: '🔓',
  USER: '👤',
  USERS: '👥',

  // Communication
  SPEECH: '💬',
  EMAIL: '📧',

  // Stats & Charts
  CHART: '📊',
};

/**
 * Common emoji combinations for specific UI states
 */
export const EMOJI_STATES = {
  // Button states
  SAVED: `${EMOJI.CHECK} Saved!`,
  SAVING: `${EMOJI.REFRESH} Saving...`,
  IMPORTING: `${EMOJI.IMPORT} Importing...`,
  IMPORTED: `${EMOJI.CHECK} Imported!`,
  IMPORT_PROMPT: `${EMOJI.IMPORT} Import Cookies from This Site`,

  // Video generation states
  VIDEO_STARTED: `${EMOJI.CHECK} Video generation started!`,
  VIDEO_READY: `${EMOJI.VIDEO} Video ready`,

  // Login/Auth states
  NOT_LOGGED_IN: `${EMOJI.WARNING} Not logged in to PixSim7`,
  LOGIN: `${EMOJI.GLOBE} Login`,
  LOGGED_IN: `${EMOJI.CHECK} Logged in`,

  // Account widget states
  OPENED: `${EMOJI.CHECK} Opened`,
  OPEN_IN_TAB: `${EMOJI.GLOBE} Open in Tab`,

  // Reset states
  RESET: `${EMOJI.CHECK} Reset!`,
  RESETTING: `${EMOJI.REFRESH} Resetting...`,

  // Error states
  ERROR: (msg) => `${EMOJI.ERROR} Error: ${msg}`,
  WARNING: (msg) => `${EMOJI.WARNING} ${msg}`,
};

/**
 * Emoji for provider status badges
 */
export const PROVIDER_STATUS_EMOJI = {
  error: EMOJI.WARNING,
  success: EMOJI.CHECK,
  pending: EMOJI.REFRESH,
  unknown: EMOJI.WARNING,
};

/**
 * Widget-specific emojis
 */
export const WIDGET_EMOJI = {
  TITLE: EMOJI.ART,
  HEADER: `${EMOJI.ART} PixSim7 Accounts`,
  REFRESH_BUTTON: EMOJI.REFRESH,
  OPEN_IN_TAB: `${EMOJI.GLOBE} Open in Tab`,
};

/**
 * Account action emojis
 */
export const ACCOUNT_ACTIONS = {
  LOGIN: `${EMOJI.GLOBE} Login`,
  RUN_PRESET: `${EMOJI.PLAY} Preset`,
  RUN_LOOP: `${EMOJI.PLAY} Loop`,
};
