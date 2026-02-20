/**
 * PromptBlockRow — Read-only display row for a prompt block.
 *
 * Renders a block with optional colored left bar, role badge,
 * text (with optional truncation), meta line, and right-side content.
 *
 * Used in: TemplateRollResult, TemplateSlotEditor preview,
 * and any context that shows block content in a compact row.
 */
import type { ReactNode } from 'react';
import clsx from 'clsx';

import { getPromptRoleBadgeClass } from '@/lib/promptRoleUi';

import { RoleBadge } from './RoleBadge';

interface PromptBlockRowProps {
  /** Block role (character, action, camera, etc.) */
  role?: string | null;
  /** Block text content */
  text: string;
  /** Max characters before truncating with ellipsis */
  maxChars?: number;
  /** Secondary meta text (e.g. block_id, category) */
  meta?: string;
  /** Content rendered on the right side (e.g. match count) */
  rightSlot?: ReactNode;
  /** Show colored left bar matching the role */
  showBar?: boolean;
  /** Role color overrides from prompt settings */
  colorOverrides?: Record<string, string>;
  className?: string;
}

function truncateText(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}\u2026`;
}

export function PromptBlockRow({
  role,
  text,
  maxChars,
  meta,
  rightSlot,
  showBar = false,
  colorOverrides,
  className,
}: PromptBlockRowProps) {
  const displayText = maxChars ? truncateText(text, maxChars) : text;
  const barColor = getPromptRoleBadgeClass(role ?? undefined, colorOverrides);

  return (
    <div
      className={clsx(
        'flex items-start gap-2 text-xs rounded-md',
        'border border-neutral-200 dark:border-neutral-700',
        'px-2 py-1.5',
        className,
      )}
    >
      {showBar && (
        <div className={clsx('w-1 self-stretch rounded-full opacity-70 shrink-0', barColor)} />
      )}

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <RoleBadge role={role} colorOverrides={colorOverrides} />
          {rightSlot && <div className="ml-auto shrink-0">{rightSlot}</div>}
        </div>
        <div className="text-neutral-600 dark:text-neutral-300 leading-snug">
          {displayText}
        </div>
        {meta && (
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}
