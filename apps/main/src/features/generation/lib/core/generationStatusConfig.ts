/**
 * Generation Status Configuration
 *
 * Centralized configuration for generation status display across the app.
 * All status-related UI should import from here to ensure consistency.
 */

import type { IconName } from '@lib/icons';

import type { GenerationStatus } from '@features/generation';

export interface GenerationStatusConfig {
  /** Display label */
  label: string;
  /** Icon name (from Icon) */
  icon: IconName;
  /** Base color name */
  color: 'yellow' | 'amber' | 'blue' | 'green' | 'red' | 'neutral';
  /** Human-readable description */
  description: string;
}

/**
 * Core status configuration
 * All other status display functions should derive from this
 */
export const GENERATION_STATUS_CONFIG: Record<GenerationStatus, GenerationStatusConfig> = {
  pending: {
    label: 'Pending',
    icon: 'clock',
    color: 'yellow',
    description: 'Waiting to start',
  },
  queued: {
    label: 'Queued',
    icon: 'layers',
    color: 'amber',
    description: 'In queue',
  },
  processing: {
    label: 'Processing',
    icon: 'loader',
    color: 'blue',
    description: 'Generation in progress',
  },
  completed: {
    label: 'Completed',
    icon: 'check-circle',
    color: 'green',
    description: 'Generation complete',
  },
  failed: {
    label: 'Failed',
    icon: 'alert-circle',
    color: 'red',
    description: 'Generation failed',
  },
  cancelled: {
    label: 'Cancelled',
    icon: 'x-circle',
    color: 'neutral',
    description: 'Generation cancelled',
  },
};

/**
 * Get status configuration
 */
export function getStatusConfig(status: GenerationStatus | string): GenerationStatusConfig {
  return GENERATION_STATUS_CONFIG[status as GenerationStatus] ?? GENERATION_STATUS_CONFIG.pending;
}

/**
 * Get text color classes for status
 * Used in text-based displays
 */
export function getStatusTextColor(status: GenerationStatus | string): string {
  const config = getStatusConfig(status);
  const colorMap = {
    yellow: 'text-yellow-600 dark:text-yellow-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    neutral: 'text-neutral-600 dark:text-neutral-400',
  };
  return colorMap[config.color];
}

/**
 * Get full container classes for status (background, border, text)
 * Used in panel/card containers
 */
export function getStatusContainerClasses(status: GenerationStatus | string): string {
  const config = getStatusConfig(status);
  const classMap = {
    yellow: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    neutral: 'bg-neutral-50 dark:bg-neutral-950/30 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300',
  };
  return classMap[config.color];
}

/**
 * Get badge background classes for status
 * Used in overlay badges/widgets
 */
export function getStatusBadgeClasses(status: GenerationStatus | string): string {
  const config = getStatusConfig(status);
  const classMap = {
    yellow: '!bg-yellow-500/90 text-white',
    amber: '!bg-amber-500/90 text-white',
    blue: '!bg-blue-600/90 text-white',
    green: '!bg-green-500/90 text-white',
    red: '!bg-red-500/90 text-white',
    neutral: '!bg-neutral-500/90 text-white',
  };
  return classMap[config.color];
}
