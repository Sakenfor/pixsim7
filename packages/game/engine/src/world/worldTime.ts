/**
 * World Time Utilities
 *
 * Helpers for working with world_time (seconds since Monday/Firstday 00:00).
 * Used across backend NPC schedules and frontend time display.
 *
 * Supports configurable fantasy time systems via WorldTimeConfig:
 * - Custom hours per day (24, 30, 20, etc.)
 * - Custom days per week (7, 10, 5, etc.)
 * - Custom period definitions with aliases
 * - Custom day names
 */

import type {
  WorldTimeConfig,
  TimePeriodDefinition,
  DayDefinition,
} from '@pixsim7/shared.types';
import {
  DEFAULT_WORLD_TIME_CONFIG,
  findPeriodForHour,
  findDayForIndex,
  getTimeConstants as getTimeConstantsFromConfig,
} from '@pixsim7/shared.types';

export interface WorldTimeComponents {
  /** Day of week: 0=Monday/Firstday, 1=Tuesday/Secondday, ... */
  dayOfWeek: number;
  /** Hour of day: 0 to (hoursPerDay-1) */
  hour: number;
  /** Minute of hour: 0-59 */
  minute: number;
  /** Second of minute: 0-59 */
  second: number;
}

export interface WorldTimeComponentsWithPeriod extends WorldTimeComponents {
  /** Current period definition (if matched) */
  period?: TimePeriodDefinition;
  /** Current day definition (if matched) */
  day?: DayDefinition;
}

// Legacy constants for backward compatibility (24-hour day, 7-day week)
// Prefer using getTimeConstants(config) for configurable time systems
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;

// Legacy day names for backward compatibility
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
 * Get time constants from a WorldTimeConfig
 * @param config - World time config (uses DEFAULT_WORLD_TIME_CONFIG if not provided)
 * @returns Time constants derived from config
 */
export function getTimeConstants(config?: WorldTimeConfig) {
  return getTimeConstantsFromConfig(config ?? DEFAULT_WORLD_TIME_CONFIG);
}

/**
 * Parse world time (seconds) into components
 * @param seconds - World time in seconds (0 = Monday/Firstday 00:00)
 * @param config - Optional world time config for custom time systems
 * @returns Time components (dayOfWeek, hour, minute, second)
 */
export function parseWorldTime(
  seconds: number,
  config?: WorldTimeConfig
): WorldTimeComponents {
  const totalSeconds = Math.floor(seconds);
  const timeConfig = config ?? DEFAULT_WORLD_TIME_CONFIG;
  const constants = getTimeConstants(timeConfig);

  // Normalize to week cycle (handle negative times)
  let weekSeconds = totalSeconds % constants.secondsPerWeek;
  if (weekSeconds < 0) {
    weekSeconds += constants.secondsPerWeek;
  }

  // Calculate day of week
  const dayOfWeek = Math.floor(weekSeconds / constants.secondsPerDay);

  // Calculate time within the day
  const secondsInDay = weekSeconds % constants.secondsPerDay;
  const hour = Math.floor(secondsInDay / constants.secondsPerHour);
  const minute = Math.floor((secondsInDay % constants.secondsPerHour) / constants.secondsPerMinute);
  const second = secondsInDay % constants.secondsPerMinute;

  return { dayOfWeek, hour, minute, second };
}

/**
 * Parse world time with period and day resolution
 * @param seconds - World time in seconds
 * @param config - Optional world time config for custom time systems
 * @returns Extended time components with period and day definitions
 */
export function parseWorldTimeWithPeriod(
  seconds: number,
  config?: WorldTimeConfig
): WorldTimeComponentsWithPeriod {
  const timeConfig = config ?? DEFAULT_WORLD_TIME_CONFIG;
  const components = parseWorldTime(seconds, timeConfig);

  const period = findPeriodForHour(
    components.hour,
    timeConfig.periods,
    timeConfig.hoursPerDay
  );
  const day = findDayForIndex(components.dayOfWeek, timeConfig.days);

  return {
    ...components,
    period,
    day,
  };
}

/**
 * Convert time components back to world time seconds
 * @param components - Time components
 * @param config - Optional world time config for custom time systems
 * @returns World time in seconds
 */
export function composeWorldTime(
  components: WorldTimeComponents,
  config?: WorldTimeConfig
): number {
  const constants = getTimeConstants(config);
  return (
    components.dayOfWeek * constants.secondsPerDay +
    components.hour * constants.secondsPerHour +
    components.minute * constants.secondsPerMinute +
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
    config?: WorldTimeConfig;
  } = {}
): string {
  const timeConfig = options.config ?? DEFAULT_WORLD_TIME_CONFIG;
  const components = parseWorldTimeWithPeriod(seconds, timeConfig);

  // Use day name from config if available, otherwise fallback to legacy
  let dayName: string;
  if (components.day) {
    dayName = options.shortDay
      ? components.day.id.slice(0, 3) // First 3 chars as short name
      : components.day.displayName;
  } else {
    // Fallback to legacy day names (only works for 7-day weeks)
    const dayNames = options.shortDay ? DAY_NAMES_SHORT : DAY_NAMES;
    dayName = dayNames[components.dayOfWeek % 7] ?? `Day ${components.dayOfWeek}`;
  }

  const hourStr = components.hour.toString().padStart(2, '0');
  const minuteStr = components.minute.toString().padStart(2, '0');

  if (options.showSeconds) {
    const secondStr = components.second.toString().padStart(2, '0');
    return `${dayName} ${hourStr}:${minuteStr}:${secondStr}`;
  }

  return `${dayName} ${hourStr}:${minuteStr}`;
}

/**
 * Add time delta to world time, wrapping at week boundary
 * @param worldTime - Current world time in seconds
 * @param deltaSeconds - Time to add (can be negative)
 * @param config - Optional world time config for custom time systems
 * @returns New world time in seconds
 */
export function addWorldTime(
  worldTime: number,
  deltaSeconds: number,
  config?: WorldTimeConfig
): number {
  const constants = getTimeConstants(config);
  const newTime = worldTime + deltaSeconds;

  // Wrap at week boundary
  return ((newTime % constants.secondsPerWeek) + constants.secondsPerWeek) % constants.secondsPerWeek;
}

/**
 * Check if a world time falls within a schedule window
 * @param worldTime - World time to check
 * @param schedule - Schedule definition
 * @param config - Optional world time config for custom time systems
 * @returns True if world time is within the schedule
 */
export function isWithinSchedule(
  worldTime: number,
  schedule: {
    dayOfWeek: number;
    startTime: number; // Seconds into day
    endTime: number;   // Seconds into day
  },
  config?: WorldTimeConfig
): boolean {
  const components = parseWorldTime(worldTime, config);
  const constants = getTimeConstants(config);

  if (components.dayOfWeek !== schedule.dayOfWeek) {
    return false;
  }

  const secondsInDay =
    components.hour * constants.secondsPerHour +
    components.minute * constants.secondsPerMinute +
    components.second;

  return secondsInDay >= schedule.startTime && secondsInDay < schedule.endTime;
}

/**
 * Get the next occurrence of a specific time (day + hour)
 * @param currentWorldTime - Current world time
 * @param targetDayOfWeek - Target day (0 to daysPerWeek-1)
 * @param targetHour - Target hour (0 to hoursPerDay-1)
 * @param config - Optional world time config for custom time systems
 * @returns World time in seconds for next occurrence
 */
export function getNextOccurrence(
  currentWorldTime: number,
  targetDayOfWeek: number,
  targetHour: number,
  config?: WorldTimeConfig
): number {
  const constants = getTimeConstants(config);

  // Compose the target time within the current week
  const targetSeconds = composeWorldTime(
    {
      dayOfWeek: targetDayOfWeek,
      hour: targetHour,
      minute: 0,
      second: 0,
    },
    config
  );

  // If target is in the future this week, return it
  if (targetSeconds > currentWorldTime) {
    return targetSeconds;
  }

  // Target has passed this week, wrap to next week
  return addWorldTime(targetSeconds, constants.secondsPerWeek, config);
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
 * @param config - Optional world time config for custom time systems
 * @returns Formatted string (e.g., "2h 30m" or "1d 4h")
 */
export function formatDuration(seconds: number, config?: WorldTimeConfig): string {
  const constants = getTimeConstants(config);
  const absSec = Math.abs(seconds);

  const days = Math.floor(absSec / constants.secondsPerDay);
  const hours = Math.floor((absSec % constants.secondsPerDay) / constants.secondsPerHour);
  const minutes = Math.floor((absSec % constants.secondsPerHour) / constants.secondsPerMinute);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return (seconds < 0 ? '-' : '') + parts.join(' ');
}

/**
 * Get the current time period ID for a given world time
 * @param worldTime - World time in seconds
 * @param config - Optional world time config for custom time systems
 * @returns Period ID or 'unknown' if no matching period
 */
export function getTimePeriod(worldTime: number, config?: WorldTimeConfig): string {
  const components = parseWorldTimeWithPeriod(worldTime, config);
  return components.period?.id ?? 'unknown';
}

/**
 * Check if the current day is a rest day
 * @param worldTime - World time in seconds
 * @param config - Optional world time config for custom time systems
 * @returns True if current day is marked as a rest day
 */
export function isRestDay(worldTime: number, config?: WorldTimeConfig): boolean {
  const components = parseWorldTimeWithPeriod(worldTime, config);
  return components.day?.isRestDay ?? false;
}

/**
 * Get special flags for the current day
 * @param worldTime - World time in seconds
 * @param config - Optional world time config for custom time systems
 * @returns Array of special flags for the current day
 */
export function getDayFlags(worldTime: number, config?: WorldTimeConfig): string[] {
  const components = parseWorldTimeWithPeriod(worldTime, config);
  return components.day?.specialFlags ?? [];
}
