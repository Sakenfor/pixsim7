import React from 'react';
import clsx from 'clsx';

/**
 * Select — canonical dropdown select component.
 * REUSE this component for any select/dropdown across the app.
 * If you need a variant, extend via props instead of copying.
 */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /**
   * Visual size variant
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Additional CSS classes to apply
   */
  className?: string;
  /**
   * Whether the select has an error state
   */
  error?: boolean;
  /**
   * Use transparent background (for inline selects)
   */
  transparent?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'sm', className, error, disabled, transparent, ...props }, ref) => {
    return (
      <select
        ref={ref}
        disabled={disabled}
        className={clsx(
          'w-full rounded border outline-none transition-colors',
          'focus:ring-2 focus:ring-blue-500/40',
          // Background colors
          transparent
            ? 'bg-transparent'
            : 'bg-white dark:bg-neutral-800',
          // Size variants
          size === 'sm' && 'text-xs px-2 py-1.5',
          size === 'md' && 'text-sm px-3 py-2',
          size === 'lg' && 'text-base px-4 py-2.5',
          // Border colors
          error
            ? 'border-red-500 dark:border-red-500'
            : 'border-neutral-300 dark:border-neutral-700',
          // Disabled state
          disabled && 'opacity-60 cursor-not-allowed',
          className
        )}
        {...props}
      />
    );
  }
);

Select.displayName = 'Select';
