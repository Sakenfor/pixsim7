import * as React from 'react'
import clsx from 'clsx'

export type SwitchProps = {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  id?: string
  name?: string
}

const sizes = {
  sm: {
    track: 'w-7 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-3',
  },
  md: {
    track: 'w-9 h-5',
    thumb: 'w-4 h-4',
    translate: 'translate-x-4',
  },
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked = false, onCheckedChange, disabled = false, size = 'md', className, id, name },
  ref,
) {
  const sizeStyles = sizes[size]

  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      name={name}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={clsx(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'bg-brand-600'
          : 'bg-neutral-300 dark:bg-neutral-600',
        sizeStyles.track,
        className,
      )}
    >
      <span
        className={clsx(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm transition-transform',
          'translate-x-0.5',
          checked && sizeStyles.translate,
          sizeStyles.thumb,
        )}
      />
    </button>
  )
})
Switch.displayName = 'Switch'
