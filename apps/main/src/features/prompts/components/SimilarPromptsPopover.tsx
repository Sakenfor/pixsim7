/**
 * SimilarPromptsPopover — semantic "find similar" for the prompt composer.
 *
 * Lists PromptVersions whose text is semantically close to the current composer
 * text (pgvector search via /prompts/search/similar?mode=vector). A threshold
 * slider tightens/loosens the match set. Clicking a result hands its text back
 * via `onUse` so the composer can load it.
 *
 * Part of plan embedding-service-generalization, Phase D (d3).
 */
import { Popover } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { searchSimilarPrompts, type SimilarPromptMatch } from '@lib/api/prompts';
import { Icon } from '@lib/icons';

export interface SimilarPromptsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Current composer text — the query. */
  promptText: string;
  /** Called with a result's text when the user picks it. */
  onUse?: (text: string) => void;
}

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 10;

export function SimilarPromptsPopover({
  open,
  onClose,
  anchor,
  triggerRef,
  promptText,
  onUse,
}: SimilarPromptsPopoverProps) {
  const [threshold, setThreshold] = useState(0.5);
  const [results, setResults] = useState<SimilarPromptMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id so a slow earlier response can't clobber a newer one.
  const reqIdRef = useRef(0);

  const query = promptText.trim();
  const hasQuery = query.length > 0;

  const runSearch = useCallback(async () => {
    if (!hasQuery) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchSimilarPrompts({
        prompt: query,
        mode: 'vector',
        limit: RESULT_LIMIT,
        threshold,
      });
      if (reqId !== reqIdRef.current) return; // stale
      setResults(res.results);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [hasQuery, query, threshold]);

  // Debounced fetch while open, re-firing on query/threshold change.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(runSearch, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, runSearch]);

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchor={anchor}
      triggerRef={triggerRef}
      placement="bottom"
      align="end"
      offset={6}
      className="w-[340px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl"
    >
      <div className="flex flex-col max-h-[60vh]">
        <div className="px-3 pt-2 pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
            <Icon name="sparkles" size={12} />
            Similar prompts (semantic)
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
              Min similarity
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 h-1 accent-accent cursor-pointer"
              title={`Min similarity: ${threshold.toFixed(2)}`}
            />
            <span className="text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400 w-7 text-right">
              {threshold.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto py-1">
          {!hasQuery && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Type a prompt to find similar versions.
            </div>
          )}
          {hasQuery && loading && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              Searching…
            </div>
          )}
          {hasQuery && !loading && error && (
            <div className="px-3 py-4 text-center text-[11px] text-red-500">{error}</div>
          )}
          {hasQuery && !loading && !error && results.length === 0 && (
            <div className="px-3 py-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
              No similar prompts above this threshold.
            </div>
          )}
          {hasQuery &&
            !loading &&
            !error &&
            results.map((r) => (
              <button
                key={r.version_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onUse?.(r.prompt_text);
                  onClose();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-start gap-2"
                title="Load this prompt into the composer"
              >
                <span className="mt-0.5 shrink-0 text-[10px] tabular-nums px-1 rounded bg-accent/10 text-accent">
                  {Math.round(r.similarity_score * 100)}%
                </span>
                <span className="text-[11px] text-neutral-700 dark:text-neutral-300 line-clamp-2">
                  {r.prompt_text}
                </span>
              </button>
            ))}
        </div>
      </div>
    </Popover>
  );
}
