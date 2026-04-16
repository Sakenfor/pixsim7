/**
 * ActionCard — generic list-row primitive for actionable items.
 *
 * Layout:
 * ```
 * ┌──────────────────────────────────────────────────────────────┐
 * │ [leading] title [status] [tags]              [actions]       │
 * │           description (truncated)                            │
 * │           meta (e.g. path · timestamp)                       │
 * └──────────────────────────────────────────────────────────────┘
 * ```
 *
 * Used by Codegen tasks, Buildable packages, Migration rows — any
 * titled row with optional description / meta / status / actions.
 *
 * Pass `body` to replace the description/meta stack with freeform
 * content (e.g. migration status details with its own layout).
 *
 * Use `density="compact"` for single-row (title + actions only).
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface ActionCardProps {
  title: ReactNode;
  /** Sub-title text under the title. Ignored when `body` is set. */
  description?: ReactNode;
  /** Additional meta line (path, timestamp). Ignored when `body` is set. */
  meta?: ReactNode;
  /** Replaces description + meta with freeform content. */
  body?: ReactNode;
  /** Status indicator next to title (typically a StatusPill). */
  status?: ReactNode;
  /** Tags next to status (typically Badge[]). */
  tags?: ReactNode;
  /** Trailing actions (buttons) on the right. */
  actions?: ReactNode;
  /** Leading element (icon, dot) left of title. */
  leading?: ReactNode;
  /** Slight left indent for nested/child rows. */
  indented?: boolean;
  /** `compact` collapses to a single row. Default renders title + stacked body. */
  density?: 'compact' | 'default';
  className?: string;
  onClick?: () => void;
}

export function ActionCard({
  title,
  description,
  meta,
  body,
  status,
  tags,
  actions,
  leading,
  indented,
  density = 'default',
  className,
  onClick,
}: ActionCardProps) {
  const compact = density === 'compact';
  return (
    <div
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded border border-border bg-surface-secondary transition-colors',
        compact
          ? 'px-2 py-1 hover:bg-surface-hover'
          : 'px-3 py-2',
        onClick && 'cursor-pointer',
        indented && 'ml-4',
        className,
      )}
    >
      {leading && <span className="shrink-0">{leading}</span>}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={clsx(
            'font-semibold text-gray-200 truncate',
            compact ? 'text-[11px]' : 'text-xs',
          )}>
            {title}
          </span>
          {status}
          {tags}
        </div>
        {!compact && body}
        {!compact && !body && description && (
          <div className="text-[10px] text-gray-500 truncate mt-0.5">{description}</div>
        )}
        {!compact && !body && meta && (
          <div className="text-[10px] text-gray-600 font-mono mt-0.5">{meta}</div>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
