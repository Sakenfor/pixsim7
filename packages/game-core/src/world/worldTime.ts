/**
 * World Time Utilities
 *
 * Helpers for working with world_time (seconds since Monday 00:00).
 * Used across backend NPC schedules and frontend time display.
 */

export interface WorldTimeComponents {
  /** Day of week: 0=Monday, 1=Tuesday, ..., 6=Sunday */
  dayOfWeek: number;
  /** Hour of day: 0-23 */
  hour: number;
  /** Minute of hour: 0-59 */
  minute: number;
  /** Second of minute: 0-59 */
  second: number;
}

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Parse world time (seconds) into components
 * @param seconds - World time in seconds (0 = Monday 00:00)
 * @returns Time components (dayOfWeek, hour, minute, second)
 */
export function parseWorldTime(seconds: number): WorldTimeComponents {
  const totalSeconds = Math.floor(seconds);

  // Calculate day of week (0-6)
  const dayOfWeek = Math.floor(totalSeconds / SECONDS_PER_DAY) % 7;

  // Calculate time within the day
  const secondsInDay = totalSeconds % SECONDS_PER_DAY;
  const hour = Math.floor(secondsInDay / SECONDS_PER_HOUR);
  const minute = Math.floor((secondsInDay % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const second = secondsInDay % SECONDS_PER_MINUTE;

  return { dayOfWeek, hour, minute, second };
}

/**
 * Convert time components back to world time seconds
 * @param components - Time components
 * @returns World time in seconds
 */
export function composeWorldTime(components: WorldTimeComponents): number {
  return (
    components.dayOfWeek * SECONDS_PER_DAY +
    components.hour * SECONDS_PER_HOUR +
    components.minute * SECONDS_PER_MINUTE +
    components.second
  );
}

/**
 * Format world time as human-readable string
 * @param seconds - World time in seconds
 * @param options - Formatting options
 * @returns Formatted string (e.g., "Monday 14:30" or "Mon 14:30:15")
 */
export function formatWorldTime(
  seconds: number,
  options: {
    shortDay?: boolean;
    showSeconds?: boolean;
  } = {}
): string {
  const { dayOfWeek, hour, minute, second } = parseWorldTime(seconds);

  const dayNames = options.shortDay ? DAY_NAMES_SHORT : DAY_NAMES;
  const dayName = dayNames[dayOfWeek];

  const hourStr = hour.toString().padStart(2, '0');
  const minuteStr = minute.toString().padStart(2, '0');

  if (options.showSeconds) {
    const secondStr = second.toString().padStart(2, '0');
    return `${dayName} ${hourStr}:${minuteStr}:${secondStr}`;
  }

  return `${dayName} ${hourStr}:${minuteStr}`;
}

/**
 * Add time delta to world time, wrapping at week boundary
 * @param worldTime - Current world time in seconds
 * @param deltaSeconds - Time to add (can be negative)
 * @returns New world time in seconds
 */
export function addWorldTime(worldTime: number, deltaSeconds: number): number {
  const newTime = worldTime + deltaSeconds;

  // Wrap at week boundary (keep within 0-604800)
  return ((newTime % SECONDS_PER_WEEK) + SECONDS_PER_WEEK) % SECONDS_PER_WEEK;
}

/**
 * Check if a world time falls within a schedule window
 * @param worldTime - World time to check
 * @param schedule - Schedule definition
 * @returns True if world time is within the schedule
 */
export function isWithinSchedule(
  worldTime: number,
  schedule: {
    dayOfWeek: number;
    startTime: number; // Seconds into day
    endTime: number;   // Seconds into day
  }
): boolean {
  const { dayOfWeek, hour, minute, second } = parseWorldTime(worldTime);

  if (dayOfWeek !== schedule.dayOfWeek) {
    return false;
  }

  const secondsInDay = hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE + second;

  return secondsInDay >= schedule.startTime && secondsInDay < schedule.endTime;
}

/**
 * Get the next occurrence of a specific time (day + hour)
 * @param currentWorldTime - Current world time
 * @param targetDayOfWeek - Target day (0-6)
 * @param targetHour - Target hour (0-23)
 * @returns World time in seconds for next occurrence
 */
export function getNextOccurrence(
  currentWorldTime: number,
  targetDayOfWeek: number,
  targetHour: number
): number {
  // Compose the target time within the current week
  const targetSeconds = composeWorldTime({
    dayOfWeek: targetDayOfWeek,
    hour: targetHour,
    minute: 0,
    second: 0,
  });

  // If target is in the future this week, return it
  if (targetSeconds > currentWorldTime) {
    return targetSeconds;
  }

  // Target has passed this week, wrap to next week
  return addWorldTime(targetSeconds, SECONDS_PER_WEEK);
}

/**
 * Calculate time difference between two world times
 * @param from - Start time
 * @param to - End time
 * @returns Difference in seconds (can be negative if to < from)
 */
export function worldTimeDiff(from: number, to: number): number {
  return to - from;
}

/**
 * Format a duration in seconds as human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "2h 30m" or "1d 4h")
 */
export function formatDuration(seconds: number): string {
  const absSec = Math.abs(seconds);
  const days = Math.floor(absSec / SECONDS_PER_DAY);
  const hours = Math.floor((absSec % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((absSec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return (seconds < 0 ? '-' : '') + parts.join(' ');
}
