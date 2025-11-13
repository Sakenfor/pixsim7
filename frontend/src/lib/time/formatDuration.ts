/**
 * Time formatting utilities for human-readable durations.
 */

/**
 * Format milliseconds into a human-readable duration string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1m 23s", "45s", "2h 15m")
 *
 * @example
 * ```ts
 * formatDuration(1000) // "1s"
 * formatDuration(65000) // "1m 5s"
 * formatDuration(3723000) // "1h 2m"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0s';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const h = hours % 24;
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  }

  if (hours > 0) {
    const m = minutes % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }

  if (minutes > 0) {
    const s = seconds % 60;
    return s > 0 ? `${minutes}m ${s}s` : `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format a timestamp relative to now.
 *
 * @param timestamp - ISO timestamp string or Date object
 * @returns Formatted relative duration (e.g., "2m 30s ago")
 *
 * @example
 * ```ts
 * formatRelativeTime("2024-01-01T12:00:00Z") // "5m 23s ago"
 * ```
 */
export function formatRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const elapsed = now - date.getTime();

  if (elapsed < 0) return 'just now';

  return `${formatDuration(elapsed)} ago`;
}

/**
 * Format elapsed time between two timestamps.
 *
 * @param start - Start timestamp (ISO string or Date)
 * @param end - End timestamp (ISO string or Date), defaults to now
 * @returns Formatted duration string
 *
 * @example
 * ```ts
 * formatElapsed("2024-01-01T12:00:00Z", "2024-01-01T12:05:30Z") // "5m 30s"
 * ```
 */
export function formatElapsed(start: string | Date, end?: string | Date): string {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = end
    ? typeof end === 'string' ? new Date(end) : end
    : new Date();

  const elapsed = endDate.getTime() - startDate.getTime();
  return formatDuration(elapsed);
}

/**
 * Format a short relative time for compact displays.
 * Uses abbreviated units and only shows the most significant unit.
 *
 * @param timestamp - ISO timestamp string or Date object
 * @returns Compact formatted string (e.g., "2m", "1h", "3d")
 *
 * @example
 * ```ts
 * formatCompactRelativeTime("2024-01-01T12:00:00Z") // "5m"
 * ```
 */
export function formatCompactRelativeTime(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const elapsed = now - date.getTime();

  if (elapsed < 0) return 'now';

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
