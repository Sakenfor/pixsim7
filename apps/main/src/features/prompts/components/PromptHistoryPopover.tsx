/**
 * PromptHistoryPopover — shows the undo/redo timeline with clause-level diffs.
 */

import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

import type { PromptTimeline } from '../hooks/usePromptHistory';
import { diffPrompt, diffSummary } from '../lib/promptDiff';

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}\u2026`;
}

interface DiffDisplayProps {
  prev: string;
  next: string;
}

function DiffDisplay({ prev, next }: DiffDisplayProps) {
  const segments = useMemo(() => diffPrompt(prev, next), [prev, next]);

  // If diff only has 'keep' segments, nothing interesting to show
  const hasChanges = segments.some((s) => s.type !== 'keep');
  if (!hasChanges) return null;

  return (
    <div className="flex flex-wrap gap-x-1 text-[10px] leading-relaxed mt-1">
      {segments.map((seg, i) => (
        <span
          key={i}
          className={clsx(
            'inline',
            seg.type === 'add' && 'bg-green-500/15 text-green-700 dark:text-green-400',
            seg.type === 'remove' &&
              'bg-red-500/15 text-red-600 dark:text-red-400 line-through opacity-70',
            seg.type === 'keep' && 'text-neutral-400 dark:text-neutral-500',
          )}
        >
          {truncate(seg.text, 60)}
        </span>
      ))}
    </div>
  );
}

export interface PromptHistoryPopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  triggerRef: React.RefObject<HTMLElement | null>;
  timeline: PromptTimeline;
  onJumpTo: (index: number) => void;
}

export function PromptHistoryPopover({
  open,
  onClose,
  anchor,
  triggerRef,
  timeline,
  onJumpTo,
}: PromptHistoryPopoverProps) {
  const { entries, currentIndex } = timeline;

  if (!open || entries.length <= 1) return null;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      placement="bottom"
      align="start"
      offset={6}
      triggerRef={triggerRef}
      className="w-[320px] max-h-[400px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          Prompt History
        </span>
        <span className="text-[10px] text-neutral-400 tabular-nums">
          {entries.length} entries
        </span>
      </div>

      <div className="overflow-y-auto max-h-[340px] thin-scrollbar">
        {/* Show newest first */}
        {[...entries].reverse().map((entry, reverseIdx) => {
          const idx = entries.length - 1 - reverseIdx;
          const isCurrent = idx === currentIndex;
          const isFuture = idx > currentIndex;
          const prev = idx > 0 ? entries[idx - 1] : null;
          const summary = prev !== null ? diffSummary(prev, entry) : 'Initial';

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (!isCurrent) onJumpTo(idx);
              }}
              disabled={isCurrent}
              className={clsx(
                'w-full text-left px-3 py-2 border-b border-neutral-50 dark:border-neutral-800/50 transition-colors',
                isCurrent
                  ? 'bg-accent/5 dark:bg-accent/10'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer',
                isFuture && !isCurrent && 'opacity-50',
              )}
            >
              {/* Header row */}
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'w-2 h-2 rounded-full shrink-0',
                    isCurrent
                      ? 'bg-accent'
                      : isFuture
                        ? 'bg-neutral-300 dark:bg-neutral-600'
                        : 'bg-neutral-400 dark:bg-neutral-500',
                  )}
                />
                <span
                  className={clsx(
                    'text-[10px] font-medium',
                    isCurrent
                      ? 'text-accent'
                      : 'text-neutral-500 dark:text-neutral-400',
                  )}
                >
                  {isCurrent ? 'Current' : isFuture ? `Undone` : `Step ${idx + 1}`}
                </span>
                <span
                  className={clsx(
                    'ml-auto text-[9px] px-1.5 py-0.5 rounded-full',
                    summary === 'Set prompt'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : summary === 'Cleared'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        : summary.startsWith('+')
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : summary.startsWith('-')
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400',
                  )}
                >
                  {summary}
                </span>
              </div>

              {/* Text preview */}
              <div className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug">
                {entry ? truncate(entry, 100) : (
                  <span className="italic text-neutral-400 dark:text-neutral-500">Empty</span>
                )}
              </div>

              {/* Inline diff (only for non-initial entries, only for past/current) */}
              {prev !== null && !isFuture && <DiffDisplay prev={prev} next={entry} />}
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-1.5 text-[9px] text-neutral-400">
        <Icon name="undo" size={10} />
        <span>Ctrl+Z / Ctrl+Shift+Z to navigate</span>
      </div>
    </Popover>
  );
}
