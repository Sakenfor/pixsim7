/**
 * TemplateRollResult — Shows the outcome of rolling a template
 *
 * Per-slot breakdown (which block was picked, match count, fallback/skip status),
 * warnings, assembled prompt preview, and action buttons.
 */
import clsx from 'clsx';

import type { RollResult } from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import { PromptBlockRow } from '../shared/PromptBlockRow';

interface TemplateRollResultProps {
  result: RollResult;
  onUsePrompt?: (prompt: string) => void;
  maxChars?: number;
  onReroll?: () => void;
  rolling?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  skipped: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  fallback: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  empty: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export function TemplateRollResult({
  result,
  onUsePrompt,
  maxChars,
  onReroll,
  rolling,
  className,
}: TemplateRollResultProps) {
  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      {/* Summary bar */}
      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span>{result.metadata.slots_filled}/{result.metadata.slots_total} filled</span>
        {result.metadata.slots_skipped > 0 && (
          <span>{result.metadata.slots_skipped} skipped</span>
        )}
        {result.metadata.slots_fallback > 0 && (
          <span>{result.metadata.slots_fallback} fallback</span>
        )}
        <span className="ml-auto">Roll #{result.metadata.roll_count}</span>
      </div>

      {/* Slot results */}
      <div className="space-y-1.5">
        {result.slot_results.map((sr, i) => {
          // Selected slots render with PromptBlockRow for role-colored display
          if (sr.status === 'selected' && sr.prompt_preview) {
            return (
              <PromptBlockRow
                key={i}
                role={sr.selected_block_role}
                text={sr.prompt_preview}
                maxChars={120}
                meta={sr.selected_block_string_id}
                showBar
                rightSlot={
                  <span className="text-[10px] text-neutral-400 tabular-nums">
                    {sr.match_count} match{sr.match_count === 1 ? '' : 'es'}
                  </span>
                }
              />
            );
          }

          // Non-selected slots (skipped, fallback, empty)
          return (
            <div
              key={i}
              className="flex items-start gap-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1.5"
            >
              <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_COLORS[sr.status])}>
                {sr.status}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-neutral-700 dark:text-neutral-200">
                  {sr.label || `Slot ${i + 1}`}
                </div>
                {sr.status === 'fallback' && sr.fallback_text && (
                  <div className="text-amber-600 dark:text-amber-400 mt-0.5 italic">
                    Fallback: {sr.fallback_text}
                  </div>
                )}
                {sr.reason && (
                  <div className="text-neutral-400 dark:text-neutral-500 mt-0.5">{sr.reason}</div>
                )}
              </div>
              <span className="text-[10px] text-neutral-400 tabular-nums">
                {sr.match_count} match{sr.match_count === 1 ? '' : 'es'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
              <Icon name="alertCircle" size={12} className="mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Assembled prompt */}
      {result.assembled_prompt && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              Assembled prompt
            </span>
            {maxChars != null && (
              <span className={clsx(
                'text-[10px] tabular-nums',
                result.assembled_prompt.length > maxChars
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-neutral-400 dark:text-neutral-500',
              )}>
                {result.assembled_prompt.length} / {maxChars}
              </span>
            )}
          </div>
          <div className="text-xs bg-neutral-50 dark:bg-neutral-900/60 rounded-md border border-neutral-200 dark:border-neutral-700 p-2 whitespace-pre-wrap max-h-40 overflow-y-auto thin-scrollbar">
            {result.assembled_prompt}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {onUsePrompt && result.assembled_prompt && (
          <button
            type="button"
            onClick={() => onUsePrompt(result.assembled_prompt)}
            className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Use this prompt
          </button>
        )}
        {onReroll && (
          <button
            type="button"
            onClick={onReroll}
            disabled={rolling}
            className="px-3 py-1.5 rounded text-xs font-medium border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            <Icon name="refresh" size={12} className={clsx('inline mr-1', rolling && 'animate-spin')} />
            Re-roll
          </button>
        )}
      </div>
    </div>
  );
}
