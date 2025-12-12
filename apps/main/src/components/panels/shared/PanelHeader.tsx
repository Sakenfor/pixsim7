import type { ReactNode } from 'react';
import type { PanelCategory } from '@lib/panels';

// Re-export for backwards compatibility
export type PanelHeaderCategory = PanelCategory;

export interface PanelHeaderProps {
  /** Main panel title (e.g., "Scene Graph", "Game World") */
  title: string;

  /** Optional icon (string glyph or React element) */
  icon?: ReactNode;

  /** High-level category to visually group panels */
  category?: PanelCategory;

  /** Optional contextual label (e.g., "World #3", "Scene: intro") */
  contextLabel?: string;

  /** Optional status indicator (icon or small badge) */
  statusIcon?: ReactNode;
  statusLabel?: string;

  /**
   * Called when the title area is clicked.
   *
   * Intended for “change panel type” / “switch surface” interactions,
   * similar to Blender’s editor type dropdown.
   */
  onClickTitle?: () => void;

  /** Called when the overflow/menu button is clicked */
  onOpenMenu?: () => void;

  /** Optional right-aligned children (custom actions, toggles) */
  children?: ReactNode;

  className?: string;
}

export function PanelHeader({
  title,
  icon,
  category,
  contextLabel,
  statusIcon,
  statusLabel,
  onClickTitle,
  onOpenMenu,
  children,
  className = '',
}: PanelHeaderProps) {
  const clickableTitle = typeof onClickTitle === 'function';

  return (
    <div
      className={`flex items-center justify-between px-2 py-1 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/80 text-xs select-none ${className}`}
    >
      <button
        type="button"
        className={`flex items-center gap-2 min-w-0 ${clickableTitle ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : 'cursor-default'}`}
        onClick={onClickTitle}
        disabled={!clickableTitle}
      >
        {icon && (
          <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
            {icon}
          </span>
        )}
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate font-semibold text-neutral-800 dark:text-neutral-100">
            {title}
          </span>
          {category && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
              {category}
            </span>
          )}
        </span>
        {contextLabel && (
          <span className="ml-1 truncate text-[10px] text-neutral-500 dark:text-neutral-400">
            {contextLabel}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 ml-2">
        {statusIcon && (
          <div className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <span>{statusIcon}</span>
            {statusLabel && <span className="truncate">{statusLabel}</span>}
          </div>
        )}
        {children}
        {onOpenMenu && (
          <button
            type="button"
            onClick={onOpenMenu}
            className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-700/80"
            title="Panel options"
          >
            <span className="text-xs">⋮</span>
          </button>
        )}
      </div>
    </div>
  );
}

