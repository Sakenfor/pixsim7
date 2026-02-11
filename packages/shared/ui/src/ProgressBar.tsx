import React from 'react';
import clsx from 'clsx';

export interface ProgressBarProps {
  value: number;
  max?: number;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'pink' | 'orange' | 'yellow';
  label?: string;
  showValue?: boolean;
  className?: string;
}

const colorMap: Record<string, { bg: string; bar: string }> = {
  blue: {
    bg: 'bg-accent-subtle',
    bar: 'bg-accent',
  },
  green: {
    bg: 'bg-green-100 dark:bg-green-900/20',
    bar: 'bg-green-500 dark:bg-green-600',
  },
  red: {
    bg: 'bg-red-100 dark:bg-red-900/20',
    bar: 'bg-red-500 dark:bg-red-600',
  },
  purple: {
    bg: 'bg-purple-100 dark:bg-purple-900/20',
    bar: 'bg-purple-500 dark:bg-purple-600',
  },
  pink: {
    bg: 'bg-pink-100 dark:bg-pink-900/20',
    bar: 'bg-pink-500 dark:bg-pink-600',
  },
  orange: {
    bg: 'bg-orange-100 dark:bg-orange-900/20',
    bar: 'bg-orange-500 dark:bg-orange-600',
  },
  yellow: {
    bg: 'bg-yellow-100 dark:bg-yellow-900/20',
    bar: 'bg-yellow-500 dark:bg-yellow-600',
  },
};

export function ProgressBar({
  value,
  max = 100,
  color = 'blue',
  label,
  showValue = true,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const colors = colorMap[color];

  return (
    <div className={clsx('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {value.toFixed(0)}
            </span>
          )}
        </div>
      )}
      <div className={clsx('w-full h-2 rounded-full overflow-hidden', colors.bg)}>
        <div
          className={clsx('h-full transition-all duration-300', colors.bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
