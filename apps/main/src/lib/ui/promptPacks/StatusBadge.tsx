/**
 * StatusBadge — small inline pill for lifecycle states.
 *
 * Variants come from the prompt-pack workflow's natural color
 * coding (matches PromptPackAuthoringWorkbench):
 *   - neutral   → draft status, generic metadata
 *   - success   → active version, compile_ok
 *   - warning   → submitted, validate-in-progress
 *   - info      → approved, generic positive
 *   - danger    → rejected, compile failures
 *   - accent    → owner / personal markers
 *
 * The component is pure presentation — call sites map their domain
 * state to a variant. Reuses tailwind classes already in use by the
 * workbench to keep visual parity across surfaces.
 */

import clsx from 'clsx';
import type { ReactNode } from 'react';

export type StatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'accent';

const VARIANT_CLASSES: Record<StatusBadgeVariant, string> = {
  neutral:
    'border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
  success:
    'border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300',
  warning:
    'border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300',
  info:
    'border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300',
  danger:
    'border-red-200 text-red-700 dark:border-red-800/40 dark:text-red-300',
  accent:
    'border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300',
};

export interface StatusBadgeProps {
  children: ReactNode;
  variant?: StatusBadgeVariant;
  title?: string;
  className?: string;
}

export function StatusBadge({
  children,
  variant = 'neutral',
  title,
  className,
}: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={clsx(
        'text-[10px] px-1 py-0.5 rounded border whitespace-nowrap',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
