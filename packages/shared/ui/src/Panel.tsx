import * as React from 'react'
import clsx from 'clsx'

export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  padded?: boolean
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, children, padded = true, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm',
        padded && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})
Panel.displayName = 'Panel'
