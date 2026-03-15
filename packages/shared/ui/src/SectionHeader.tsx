/**
 * SectionHeader - Small uppercase section divider label
 *
 * Use instead of inline `text-xs font-semibold uppercase tracking-wider` spans.
 *
 * @example
 * ```tsx
 * <SectionHeader>Recently Used</SectionHeader>
 * <SectionHeader trailing={<button>Clear</button>}>History</SectionHeader>
 * ```
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface SectionHeaderProps {
  /** Section label */
  children: ReactNode;
  /** Optional element at the end of the row (e.g. action button, count) */
  trailing?: ReactNode;
  /** Size variant */
  size?: 'xs' | 'sm';
  /** Additional className */
  className?: string;
}

/**
 * Small uppercase section header for grouping content.
 */
export function SectionHeader({
  children,
  trailing,
  size = 'xs',
  className,
}: SectionHeaderProps) {
  return (
    <div className={clsx(
      'flex items-center justify-between',
      'font-semibold uppercase tracking-wider',
      'text-neutral-500 dark:text-neutral-400',
      size === 'xs' ? 'text-[10px]' : 'text-xs',
      className,
    )}>
      <span>{children}</span>
      {trailing && <span className="font-normal normal-case tracking-normal">{trailing}</span>}
    </div>
  );
}
