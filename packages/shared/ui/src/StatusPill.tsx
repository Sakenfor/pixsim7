/**
 * StatusPill — tone-based status label.
 *
 * Sections using domain-specific state (build: fresh/stale/not_built,
 * migration: up_to_date/pending, sync: downloading/error) map their
 * state onto a semantic `tone` instead of a palette color.
 *
 * @example
 * ```tsx
 * <StatusPill tone="warning" dot>Stale</StatusPill>
 * <StatusPill tone="success">Up to date</StatusPill>
 * ```
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'muted';

export interface StatusPillProps {
  tone: StatusTone;
  children?: ReactNode;
  /** Render a leading colored dot matching the tone. */
  dot?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}

const TONE_CLASSES: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  info:    { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500' },
  success: { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',     dot: 'bg-green-500' },
  warning: { bg: 'bg-amber-100 dark:bg-amber-900/30',  text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500' },
  danger:  { bg: 'bg-red-100 dark:bg-red-900/30',      text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500' },
  neutral: { bg: 'bg-neutral-200 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-300', dot: 'bg-neutral-500' },
  muted:   { bg: 'bg-transparent',                      text: 'text-neutral-500 dark:text-neutral-400', dot: 'bg-neutral-400' },
};

export function StatusPill({ tone, children, dot, size = 'xs', className }: StatusPillProps) {
  const c = TONE_CLASSES[tone];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium whitespace-nowrap',
        c.bg, c.text,
        size === 'xs' ? 'text-[10px]' : 'text-xs',
        className,
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />}
      {children}
    </span>
  );
}
