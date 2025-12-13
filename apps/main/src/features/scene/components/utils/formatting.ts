/**
 * Scene UI Formatting Helpers
 *
 * UI-specific formatting utilities for displaying scenes and playback.
 * These are presentation helpers, not business logic.
 */

/**
 * Get Tailwind color classes based on node type
 */
export function getNodeTypeColor(nodeType: string): string {
  switch (nodeType) {
    case 'video':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'choice':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'condition':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'scene_call':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
    case 'return':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case 'end':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    default:
      return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
  }
}

/**
 * Format timestamp as time (HH:MM:SS)
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Get elapsed time since reference timestamp
 */
export function getElapsedTime(timestamp: number, referenceTimestamp: number): string {
  const elapsed = (timestamp - referenceTimestamp) / 1000;
  return `+${elapsed.toFixed(1)}s`;
}
