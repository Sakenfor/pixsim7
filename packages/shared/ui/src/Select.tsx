import React from 'react';
import clsx from 'clsx';

/**
 * Select — canonical dropdown select component.
 * REUSE this component for any select/dropdown across the app.
 * If you need a variant, extend via props instead of copying.
 */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /**
   * Visual size variant. `xs` is a dense control for tight panels and
   * toolbars — smaller text and minimal vertical padding.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg';
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
  /**
   * Width behaviour. `full` (default) fills its container; `auto` sizes to
   * content — use for inline toolbar selects that should not stretch.
   */
  width?: 'full' | 'auto';
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ size = 'sm', className, error, disabled, transparent, width = 'full', ...props }, ref) => {
    return (
      <select
        ref={ref}
        disabled={disabled}
        className={clsx(
          'rounded border outline-none transition-colors',
          width === 'auto' ? 'w-auto' : 'w-full',
          'focus:ring-2 focus:ring-accent/40',
          // Background colors
          transparent
            ? 'bg-transparent'
            : 'bg-white dark:bg-neutral-800',
          // Native dropdown popup: theme the <option> list so it doesn't fall
          // back to the OS-default white background (low contrast in dark mode).
          '[&>option]:bg-white [&>option]:text-neutral-900',
          'dark:[&>option]:bg-neutral-800 dark:[&>option]:text-neutral-100',
          // Size variants
          size === 'xs' && 'text-[11px] px-2 py-0.5',
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
