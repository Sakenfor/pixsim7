/**
 * Interaction UI Formatting Helpers
 *
 * Pure formatting helpers re-exported from @pixsim7/game.engine,
 * plus UI-specific icon mappers that stay in the app layer.
 */

import type { InteractionSurface } from '@lib/registries';

// Pure formatting — from engine
export {
  formatRelativeTime,
  formatRelationshipChanges,
  formatTimeRemaining,
} from '@pixsim7/game.engine';

/**
 * Get emoji icon for interaction surface type (UI-only)
 */
export function getSurfaceIcon(surface: InteractionSurface): string {
  switch (surface) {
    case 'dialogue':
      return '\u{1F4AC}';
    case 'scene':
      return '\u{1F3AC}';
    case 'inline':
      return '\u{26A1}';
    case 'notification':
      return '\u{1F4EC}';
    case 'menu':
      return '\u{1F4CB}';
    default:
      return '\u{2022}';
  }
}

/**
 * Get icon for interaction chain status (UI-only)
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'locked':
      return '\u{1F512}';
    case 'available':
      return '\u{2B50}';
    case 'in_progress':
      return '\u{23F3}';
    case 'completed':
      return '\u{2705}';
    case 'failed':
      return '\u{274C}';
    default:
      return '\u{2022}';
  }
}

/**
 * Get icon for interaction chain category (UI-only)
 */
export function getCategoryIcon(category?: string): string {
  if (!category) return '\u{1F4CB}';

  switch (category) {
    case 'romance':
      return '\u{1F495}';
    case 'friendship':
      return '\u{1F91D}';
    case 'rivalry':
      return '\u{2694}\u{FE0F}';
    case 'mystery':
      return '\u{1F50D}';
    case 'adventure':
      return '\u{1F5FA}\u{FE0F}';
    case 'quest':
      return '\u{26A1}';
    default:
      return '\u{1F4CB}';
  }
}
