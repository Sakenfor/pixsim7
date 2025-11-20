import React from 'react';
import clsx from 'clsx';

/**
 * Input — canonical single-line input component.
 * REUSE this component for any text/number/etc input across the app.
 * If you need a variant, extend via props instead of copying.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Visual size variant
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Additional CSS classes to apply
   */
  className?: string;
  /**
   * Whether the input has an error state
   */
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ size = 'sm', className, error, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        disabled={disabled}
        className={clsx(
          'w-full rounded border bg-white dark:bg-neutral-900 outline-none transition-colors',
          'focus:ring-2 focus:ring-blue-500/40',
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

Input.displayName = 'Input';
