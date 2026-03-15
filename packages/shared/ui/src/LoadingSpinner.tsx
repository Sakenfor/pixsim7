/**
 * LoadingSpinner - Consistent loading indicator
 *
 * Use instead of inline `animate-spin` divs or icon spinners.
 *
 * @example
 * ```tsx
 * <LoadingSpinner />
 * <LoadingSpinner size="lg" />
 * <LoadingSpinner size="xs" label="Loading assets..." />
 * ```
 */

import clsx from 'clsx';

export interface LoadingSpinnerProps {
  /** Size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Optional label shown next to spinner */
  label?: string;
  /** Additional className */
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-[1.5px]',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
} as const;

/**
 * Animated loading spinner with optional label.
 */
export function LoadingSpinner({ size = 'sm', label, className }: LoadingSpinnerProps) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        className={clsx(
          'rounded-full animate-spin',
          'border-neutral-300 dark:border-neutral-600 border-t-neutral-600 dark:border-t-neutral-300',
          SIZE_CLASSES[size],
        )}
      />
      {label && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      )}
    </div>
  );
}
