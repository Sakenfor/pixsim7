/**
 * Turn Delta Presets
 *
 * Common time advancement presets for turn-based world mode.
 * Provides user-friendly constants instead of raw second values.
 */

export const TURN_DELTAS = {
  FIFTEEN_MINUTES: 900,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
  TWO_HOURS: 7200,
  FOUR_HOURS: 14400,
  SIX_HOURS: 21600,
  HALF_DAY: 43200,
  ONE_DAY: 86400,
  TWO_DAYS: 172800,
  ONE_WEEK: 604800,
} as const;

export type TurnDeltaPreset = keyof typeof TURN_DELTAS;

export interface TurnDeltaOption {
  value: number;
  label: string;
  description: string;
}

/**
 * Get all turn delta options for UI display
 */
export function getTurnDeltaOptions(): TurnDeltaOption[] {
  return [
    {
      value: TURN_DELTAS.FIFTEEN_MINUTES,
      label: '15 Minutes',
      description: 'Quick turns - 96 turns per day',
    },
    {
      value: TURN_DELTAS.THIRTY_MINUTES,
      label: '30 Minutes',
      description: 'Short turns - 48 turns per day',
    },
    {
      value: TURN_DELTAS.ONE_HOUR,
      label: '1 Hour',
      description: 'Standard turns - 24 turns per day',
    },
    {
      value: TURN_DELTAS.TWO_HOURS,
      label: '2 Hours',
      description: 'Medium turns - 12 turns per day',
    },
    {
      value: TURN_DELTAS.FOUR_HOURS,
      label: '4 Hours',
      description: 'Long turns - 6 turns per day',
    },
    {
      value: TURN_DELTAS.SIX_HOURS,
      label: '6 Hours',
      description: 'Quarter-day turns - 4 turns per day',
    },
    {
      value: TURN_DELTAS.HALF_DAY,
      label: '12 Hours (Half Day)',
      description: 'Half-day turns - 2 turns per day',
    },
    {
      value: TURN_DELTAS.ONE_DAY,
      label: '1 Day (24 Hours)',
      description: 'Daily turns - 1 turn per day',
    },
    {
      value: TURN_DELTAS.TWO_DAYS,
      label: '2 Days',
      description: 'Multi-day turns - 3.5 turns per week',
    },
    {
      value: TURN_DELTAS.ONE_WEEK,
      label: '1 Week',
      description: 'Weekly turns - full week per turn',
    },
  ];
}

/**
 * Get label for a turn delta value
 */
export function getTurnDeltaLabel(deltaSeconds: number): string {
  const options = getTurnDeltaOptions();
  const option = options.find((opt) => opt.value === deltaSeconds);
  if (option) {
    return option.label;
  }

  // Custom value - format dynamically
  const hours = deltaSeconds / 3600;
  const days = deltaSeconds / 86400;

  if (days >= 1 && days === Math.floor(days)) {
    return `${days} Day${days > 1 ? 's' : ''}`;
  }
  if (hours >= 1 && hours === Math.floor(hours)) {
    return `${hours} Hour${hours > 1 ? 's' : ''}`;
  }
  const minutes = deltaSeconds / 60;
  return `${minutes} Minute${minutes > 1 ? 's' : ''}`;
}

/**
 * Find closest preset to a given delta value
 */
export function findClosestPreset(deltaSeconds: number): TurnDeltaOption {
  const options = getTurnDeltaOptions();
  let closest = options[0];
  let minDiff = Math.abs(options[0].value - deltaSeconds);

  for (const option of options) {
    const diff = Math.abs(option.value - deltaSeconds);
    if (diff < minDiff) {
      minDiff = diff;
      closest = option;
    }
  }

  return closest;
}
