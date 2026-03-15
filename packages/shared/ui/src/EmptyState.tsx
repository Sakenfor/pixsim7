/**
 * EmptyState - Placeholder for empty lists/views
 *
 * Use instead of inline "No items found" text with ad-hoc styling.
 *
 * @example
 * ```tsx
 * <EmptyState message="No plugins found" />
 * <EmptyState message="No assets match filters" action={<Button size="sm">Clear filters</Button>} />
 * <EmptyState message="No scenes yet" icon="film" bordered />
 * ```
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Primary message */
  message: string;
  /** Optional secondary description */
  description?: string;
  /** Optional icon (emoji string or ReactNode) */
  icon?: ReactNode;
  /** Optional action element (e.g. a button) */
  action?: ReactNode;
  /** Show dashed border around the empty state */
  bordered?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional className */
  className?: string;
}

/**
 * Empty state placeholder for lists, grids, and panels.
 */
export function EmptyState({
  message,
  description,
  icon,
  action,
  bordered = false,
  size = 'sm',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        size === 'sm' ? 'py-4 px-3 gap-1.5' : 'py-8 px-4 gap-2',
        bordered && 'border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg',
        className,
      )}
    >
      {icon && (
        <div className={size === 'sm' ? 'text-lg' : 'text-2xl'}>{icon}</div>
      )}
      <p className={clsx(
        'text-neutral-500 dark:text-neutral-400',
        size === 'sm' ? 'text-xs' : 'text-sm',
      )}>
        {message}
      </p>
      {description && (
        <p className={clsx(
          'text-neutral-400 dark:text-neutral-500',
          size === 'sm' ? 'text-[11px]' : 'text-xs',
        )}>
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
