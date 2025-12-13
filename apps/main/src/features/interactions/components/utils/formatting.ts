/**
 * Interaction UI Formatting Helpers
 *
 * UI-specific formatting utilities for displaying interactions.
 * These are presentation helpers, not business logic.
 */

import type { InteractionSurface } from '@lib/registries';

/**
 * Get emoji icon for interaction surface type
 */
export function getSurfaceIcon(surface: InteractionSurface): string {
  switch (surface) {
    case 'dialogue':
      return '💬';
    case 'scene':
      return '🎬';
    case 'inline':
      return '⚡';
    case 'notification':
      return '📬';
    case 'menu':
      return '📋';
    default:
      return '•';
  }
}

/**
 * Get icon for interaction chain status
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'locked':
      return '🔒';
    case 'available':
      return '⭐';
    case 'in_progress':
      return '⏳';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    default:
      return '•';
  }
}

/**
 * Get icon for interaction chain category
 */
export function getCategoryIcon(category?: string): string {
  if (!category) return '📋';

  switch (category) {
    case 'romance':
      return '💕';
    case 'friendship':
      return '🤝';
    case 'rivalry':
      return '⚔️';
    case 'mystery':
      return '🔍';
    case 'adventure':
      return '🗺️';
    case 'quest':
      return '⚡';
    default:
      return '📋';
  }
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 0) return `${seconds}s ago`;
  return 'just now';
}

/**
 * Format relationship changes for display
 */
export function formatRelationshipChanges(deltas?: {
  trust?: number;
  affection?: number;
  respect?: number;
  attraction?: number;
}): string | null {
  if (!deltas) return null;

  const changes: string[] = [];
  if (deltas.trust) changes.push(`Trust ${deltas.trust > 0 ? '+' : ''}${deltas.trust}`);
  if (deltas.affection) changes.push(`Affection ${deltas.affection > 0 ? '+' : ''}${deltas.affection}`);
  if (deltas.respect) changes.push(`Respect ${deltas.respect > 0 ? '+' : ''}${deltas.respect}`);
  if (deltas.attraction) changes.push(`Attraction ${deltas.attraction > 0 ? '+' : ''}${deltas.attraction}`);

  return changes.length > 0 ? changes.join(', ') : null;
}

/**
 * Format time remaining in seconds (e.g., "2h 30m" or "5m")
 */
export function formatTimeRemaining(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}
