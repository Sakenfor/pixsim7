import * as React from 'react'
import clsx from 'clsx'

export type ResizeDividerProps = {
  /** Mouse down handler to start resize */
  onMouseDown: (e: React.MouseEvent) => void
  /** Whether this divider is currently being dragged */
  isDragging?: boolean
  /** Orientation of the divider */
  orientation?: 'vertical' | 'horizontal'
  /** Additional class names */
  className?: string
}

/**
 * A draggable divider for resizable panels.
 * Use with useResizablePanels hook for full functionality.
 */
export function ResizeDivider({
  onMouseDown,
  isDragging = false,
  orientation = 'vertical',
  className,
}: ResizeDividerProps) {
  const isVertical = orientation === 'vertical'

  return (
    <div
      onMouseDown={onMouseDown}
      className={clsx(
        'flex-shrink-0 group transition-colors select-none',
        isVertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        'hover:bg-blue-500/20',
        isDragging && 'bg-blue-500/30',
        className,
      )}
      title="Drag to resize"
    >
      <div
        className={clsx(
          'transition-all',
          isVertical
            ? 'w-0.5 h-full mx-auto bg-neutral-200 dark:bg-neutral-700 group-hover:bg-blue-500 group-hover:w-1'
            : 'h-0.5 w-full my-auto bg-neutral-200 dark:bg-neutral-700 group-hover:bg-blue-500 group-hover:h-1',
          isDragging && 'bg-blue-500 w-1',
        )}
      />
    </div>
  )
}
