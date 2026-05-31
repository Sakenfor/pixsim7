/**
 * DraftsList — sidebar list of prompt-pack drafts.
 *
 * Pure presentation: parent owns the data + selection, just calls
 * `onSelect` with the chosen id. Empty / loading / error states are
 * rendered inline.
 *
 * Two density modes — `compact` matches the authoring panel's slim
 * (~208px) sidebar; the default is a wider (~320px) layout.
 */

import clsx from 'clsx';

import type { PromptPackDraft } from '@lib/api/promptPacks';

import { StatusBadge } from './StatusBadge';
import { compileStatusVariant } from './statusVariants';

export interface DraftsListProps {
  drafts: PromptPackDraft[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  /** When true, render slimmer cards (Block Authoring sidebar). */
  compact?: boolean;
  /**
   * Optional id to render with a secondary highlight (e.g. derived
   * from cross-panel block selection, "the draft that mentions this
   * block"). Not the selection — that's `selectedId`.
   */
  highlightId?: string | null;
}

export function DraftsList({
  drafts,
  selectedId,
  onSelect,
  loading,
  error,
  emptyMessage = 'No drafts yet.',
  compact,
  highlightId,
}: DraftsListProps) {
  if (loading) {
    return (
      <div className={compact ? 'px-2 py-2 text-[11px] text-neutral-500' : 'text-xs text-neutral-500'}>
        Loading drafts...
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={
          compact ? 'px-2 py-2 text-[11px] text-red-400' : 'text-xs text-red-600 dark:text-red-400'
        }
      >
        {error}
      </div>
    );
  }
  if (drafts.length === 0) {
    return (
      <div className={compact ? 'px-2 py-3 text-[11px] text-neutral-500' : 'text-xs text-neutral-500'}>
        {emptyMessage}
      </div>
    );
  }
  return (
    <div className={compact ? 'flex flex-col gap-0.5 px-1' : 'space-y-1'}>
      {drafts.map((draft) => {
        const isSelected = draft.id === selectedId;
        const isHighlighted = !isSelected && draft.id === highlightId;
        return (
          <button
            key={draft.id}
            type="button"
            onClick={() => onSelect(draft.id)}
            className={clsx(
              'w-full text-left rounded border transition',
              compact ? 'px-2 py-1.5' : 'p-2',
              isSelected
                ? 'border-blue-300 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-900/20'
                : isHighlighted
                  ? 'border-amber-300/50 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/15'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <div
              className={clsx(
                'truncate',
                compact
                  ? 'text-[11px] font-mono text-neutral-800 dark:text-neutral-100'
                  : 'text-xs font-medium text-neutral-800 dark:text-neutral-100',
              )}
            >
              {draft.pack_slug}
            </div>
            <div
              className={clsx(
                'truncate',
                compact
                  ? 'text-[9px] text-neutral-500 dark:text-neutral-400'
                  : 'text-[10px] text-neutral-500 dark:text-neutral-400',
              )}
            >
              {draft.namespace}
              {!compact && draft.status ? ` · ${draft.status}` : ''}
            </div>
            <div className="mt-1 flex items-center gap-1 flex-wrap">
              {compact ? (
                <span className="text-[9px] text-neutral-500 dark:text-neutral-400">
                  {draft.status}
                </span>
              ) : (
                <StatusBadge variant="neutral">{draft.status}</StatusBadge>
              )}
              {draft.last_compile_status && (
                <StatusBadge variant={compileStatusVariant(draft.last_compile_status)}>
                  {draft.last_compile_status}
                </StatusBadge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
