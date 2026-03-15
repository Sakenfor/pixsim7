/**
 * StatCard - Compact metric display card
 *
 * Use instead of inline stat/metric card implementations.
 *
 * @example
 * ```tsx
 * <StatCard label="Total Plugins" value={42} icon="🔌" />
 * <StatCard label="Pass Rate" value="98%" sublabel="Last 7 days" />
 * ```
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface StatCardProps {
  /** Metric label */
  label: string;
  /** Metric value (number or formatted string) */
  value: ReactNode;
  /** Optional icon (emoji or ReactNode) */
  icon?: ReactNode;
  /** Optional secondary text below value */
  sublabel?: string;
  /** Additional className */
  className?: string;
}

/**
 * Small card displaying a single metric with label and optional icon.
 */
export function StatCard({
  label,
  value,
  icon,
  sublabel,
  className,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        'p-3 rounded-md border',
        'bg-neutral-50 dark:bg-neutral-800',
        'border-neutral-200 dark:border-neutral-700',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-lg">{icon}</span>}
        <span className="text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
      </div>
      <div className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        {value}
      </div>
      {sublabel && (
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
          {sublabel}
        </div>
      )}
    </div>
  );
}
