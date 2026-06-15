/**
 * VariantSuggestionsPopover — "this word has proven variations" for the composer.
 *
 * For the current prompt, finds a tight neighbour set and surfaces the variable
 * slots where swapping the filler word measurably changes the generation
 * completion rate (e.g. "fully exposed" 100% vs "naked" 0%). Read-only: it tells
 * you which word wins; it does not edit the prompt (splicing into arbitrary text
 * is left to the author for now).
 *
 * Presentational — all state lives in useVariantOutcomes (owned by the composer)
 * so it survives open/close, like SimilarPromptsPopover.
 */
import { Popover } from '@pixsim7/shared.ui';

import type { VariantValueOutcome } from '@lib/api/prompts';
import { Icon } from '@lib/icons';

import type { VariantOutcomes } from '../hooks/useVariantOutcomes';

export interface VariantSuggestionsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Shared state from useVariantOutcomes. */
  outcomes: VariantOutcomes;
}

/** Tailwind colour for a completion rate: green strong, amber middling, red weak. */
function rateClass(rate: number): string {
  if (rate >= 0.85) return 'text-emerald-600 dark:text-emerald-400';
  if (rate <= 0.5) return 'text-red-500 dark:text-red-400';
  return 'text-amber-600 dark:text-amber-400';
}

function ValueRow({ v, recommended }: { v: VariantValueOutcome; recommended: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5 text-[11px]">
      <span className="shrink-0 w-3 text-center">
        {recommended ? (
          <Icon name="check" size={10} className="text-emerald-500 inline" />
        ) : null}
      </span>
      <span
        className={
          recommended
            ? 'font-medium text-neutral-800 dark:text-neutral-100'
            : 'text-neutral-600 dark:text-neutral-400'
        }
      >
        “{v.value}”
      </span>
      <span className={`ml-auto shrink-0 tabular-nums font-medium ${rateClass(v.completion_rate)}`}>
        {Math.round(v.completion_rate * 100)}%
      </span>
      <span
        className="shrink-0 tabular-nums text-[10px] text-neutral-400 dark:text-neutral-500"
        title={`${v.completed} completed / ${v.generations} terminal generations · confidence ${Math.round(
          v.wilson_lower * 100,
        )}%`}
      >
        ({v.completed}/{v.generations})
      </span>
    </div>
  );
}

export function VariantSuggestionsPopover({
  open,
  onClose,
  anchor,
  triggerRef,
  outcomes,
}: VariantSuggestionsPopoverProps) {
  const { scope, setScope, slots, totalSlots, loading, error, hasQuery, neighbourCount } = outcomes;
  const empty = !loading && !error && slots.length === 0;

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      triggerRef={triggerRef}
      placement="bottom"
      align="end"
      offset={6}
      className="w-[360px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <div className="flex flex-col max-h-[60vh]">
        <div className="px-3 pt-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
            <Icon
              name={loading ? 'refresh' : 'sparkles'}
              size={12}
              className={loading ? 'animate-spin' : undefined}
            />
            Word variations
            {neighbourCount > 0 && (
              <span className="text-[10px] font-normal text-neutral-400 dark:text-neutral-500">
                · from {neighbourCount} similar
              </span>
            )}
            <div className="ml-auto flex items-center rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden text-[10px]">
              {(['clean', 'all'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setScope(s)}
                  className={
                    scope === s
                      ? 'px-1.5 py-0.5 bg-accent text-white font-medium'
                      : 'px-1.5 py-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }
                  title={
                    s === 'clean'
                      ? 'Clean word-level swaps only (lowercase prose, context on both sides)'
                      : 'All slots, including DSL token edits and caps content'
                  }
                >
                  {s === 'clean' ? 'Words' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            Filler words ranked by generation success in prompts like this one.
          </div>
        </div>

        <div className="overflow-y-auto py-1">
          {!hasQuery && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Type a prompt to find proven word variations.
            </div>
          )}
          {hasQuery && loading && slots.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Looking for variations…
            </div>
          )}
          {hasQuery && !loading && error && (
            <div className="px-3 py-4 text-center text-[11px] text-red-500">{error}</div>
          )}
          {hasQuery && empty && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              {neighbourCount < 2
                ? 'Not enough similar prompts to compare.'
                : scope === 'clean'
                  ? totalSlots > 0
                    ? `No clean word swaps. ${totalSlots} other slot${
                        totalSlots === 1 ? '' : 's'
                      } — try “All”.`
                    : 'No proven word variations found nearby.'
                  : 'No actionable variations found nearby.'}
            </div>
          )}
          {slots.map((slot) => (
            <div
              key={slot.slot_index}
              className="px-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
            >
              <div className="flex items-center gap-1 text-[10px] text-neutral-400 dark:text-neutral-500 mb-0.5">
                <span className="truncate">
                  …{slot.prefix} <span className="text-neutral-300 dark:text-neutral-600">▢</span>{' '}
                  {slot.suffix}…
                </span>
                <span
                  className="ml-auto shrink-0 tabular-nums px-1 rounded bg-accent/10 text-accent font-medium"
                  title="Spread between best and worst completion rate"
                >
                  Δ{Math.round(slot.delta * 100)}%
                </span>
                {slot.kind !== 'word' && (
                  <span className="shrink-0 px-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 uppercase">
                    {slot.kind}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {slot.values.map((v, i) => (
                  <ValueRow key={v.value} v={v} recommended={i === 0} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Popover>
  );
}
