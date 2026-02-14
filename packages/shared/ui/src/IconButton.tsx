import * as React from 'react'
import clsx from 'clsx'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon ReactNode (Icon, ThemedIcon, any SVG) */
  icon: React.ReactNode
  /** Background color — when set, forces white icon via inline style={{ color: '#fff' }} */
  bg?: string
  /** Button size: xs=16px, sm=20px, md=24px, lg=28px (default: md) */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Corner rounding (default: 'lg') */
  rounded?: 'md' | 'lg' | 'full'
}

const SIZES: Record<NonNullable<IconButtonProps['size']>, string> = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
}

const ROUNDED: Record<NonNullable<IconButtonProps['rounded']>, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, bg, size = 'md', rounded = 'lg', className, style, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center p-0 shrink-0 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'disabled:opacity-50 disabled:pointer-events-none',
        bg && 'shadow-sm',
        SIZES[size],
        ROUNDED[rounded],
        className,
      )}
      style={bg ? { backgroundColor: bg, color: '#fff', ...style } : style}
      {...rest}
    >
      {icon}
    </button>
  )
})
IconButton.displayName = 'IconButton'
