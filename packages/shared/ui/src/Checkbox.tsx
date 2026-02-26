import * as React from 'react'
import clsx from 'clsx'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: 'sm' | 'md'
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, size = 'sm', disabled, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      disabled={disabled}
      className={clsx(
        'rounded border border-neutral-400 bg-white text-brand-600',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        'dark:border-neutral-600 dark:bg-neutral-900',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
        className,
      )}
      {...props}
    />
  )
})

Checkbox.displayName = 'Checkbox'

