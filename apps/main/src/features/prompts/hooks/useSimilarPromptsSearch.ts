/**
 * useSimilarPromptsSearch — owns the semantic "find similar prompts" search so
 * its state survives the popover opening/closing.
 *
 * Why a hook (vs. state inside SimilarPromptsPopover): the popover trigger lives
 * in PromptComposer and needs to reflect search status (spinning while a search
 * is in flight, a result count once it lands) even while the popover is closed.
 * Lifting the state here lets both the trigger and the popover read it, and lets
 * an in-flight request finish — and its result be reused — instead of being
 * abandoned and restarted every time the popover reopens.
 *
 * Behavior:
 * - Debounced vector search runs while `open`, re-firing on query/threshold/
 *   limit/family/rank change.
 * - Results are cached by the full param set: reopening with the same inputs
 *   shows them instantly (no re-search, no flash of "Searching…").
 * - Closing mid-search does NOT cancel the in-flight request — it completes and
 *   updates state, so the trigger badge fills in even while closed.
 *
 * Part of plan embedding-service-generalization, Phase D.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { searchSimilarPrompts, type SimilarPromptMatch } from '@lib/api/prompts';
import { createKeyedAsyncCache } from '@lib/utils';

/**
 * Persistent across unmount/remount + HMR, keyed by the full param set, so the
 * (expensive) vector search isn't re-paid when the composer remounts with the
 * same inputs. In-flight de-dupe also collapses concurrent identical searches.
 */
const searchCache = createKeyedAsyncCache<SimilarPromptMatch[]>('useSimilarPromptsSearch', {
  maxEntries: 50,
});

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 10;
/** Selectable result counts. Backend caps at 50. */
export const SIMILAR_LIMIT_OPTIONS = [10, 25, 50] as const;

export interface SimilarPromptsSearch {
  threshold: number;
  setThreshold: (value: number) => void;
  /** Max results requested (the SQL LIMIT). */
  limit: number;
  setLimit: (value: number) => void;
  /** Restrict results to one prompt family, or null for all families. */
  familyId: string | null;
  setFamilyId: (value: string | null) => void;
  /**
   * When true, send rank='hybrid' so proven prompts (high successful_assets)
   * are boosted among comparably-similar matches.
   */
  hybrid: boolean;
  setHybrid: (value: boolean) => void;
  /**
   * Trigger a search now (the "Find" action). Opening the popover does NOT
   * search on its own — the user must call this. Once armed, the tuning
   * controls re-run live until the popover closes.
   */
  triggerSearch: () => void;
  /**
   * True once triggerSearch has run for the current open session (reset on
   * close). Drives the "press Find" vs "no results" empty states and whether
   * control changes auto-re-run.
   */
  armed: boolean;
  /** Trimmed current prompt text (the query) — exposed for client-side diffing. */
  query: string;
  results: SimilarPromptMatch[];
  loading: boolean;
  error: string | null;
  /** Trimmed query is non-empty. */
  hasQuery: boolean;
  /**
   * True when `results`/`error` reflect a param set other than the current one
   * (e.g. the composer text changed while the popover was closed, so no fresh
   * search has run yet). Lets the UI avoid showing stale results as if they
   * matched the current text.
   */
  stale: boolean;
}

const keyOf = (
  query: string,
  threshold: number,
  limit: number,
  familyId: string | null,
  hybrid: boolean,
) => [query, threshold, limit, familyId ?? '', hybrid ? 'h' : 's'].join('|');

export function useSimilarPromptsSearch({
  promptText,
  open,
}: {
  promptText: string;
  open: boolean;
}): SimilarPromptsSearch {
  const [threshold, setThreshold] = useState(0.5);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [hybrid, setHybrid] = useState(true);
  const [armed, setArmed] = useState(false);
  const [results, setResults] = useState<SimilarPromptMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id so a slow earlier response can't clobber a newer one.
  const reqIdRef = useRef(0);
  // Param key that `results`/`error` belong to (or that the in-flight request is
  // for). Used both to skip redundant re-searches and to detect when the current
  // inputs have drifted away from the last search.
  const searchedKeyRef = useRef<string | null>(null);

  const query = promptText.trim();
  const hasQuery = query.length > 0;
  const key = keyOf(query, threshold, limit, familyId, hybrid);

  const runSearch = useCallback(async () => {
    if (!hasQuery) {
      reqIdRef.current++; // invalidate any in-flight request
      searchedKeyRef.current = null;
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    searchedKeyRef.current = key;

    // Cache hit (possibly from an earlier mount): serve instantly, no spinner.
    const cached = searchCache.get(key);
    if (cached) {
      reqIdRef.current++; // invalidate any in-flight response
      setResults(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const matches = await searchCache.fetch(key, () =>
        searchSimilarPrompts({
          prompt: query,
          mode: 'vector',
          limit,
          threshold,
          rank: hybrid ? 'hybrid' : 'similarity',
          ...(familyId ? { family_id: familyId } : {}),
        }).then((res) => res.results),
      );
      if (reqId !== reqIdRef.current) return; // stale
      setResults(matches);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [hasQuery, key, query, threshold, limit, familyId, hybrid]);

  // Explicit "Find" action. Opening the popover does NOT search — only this
  // does. Arming also makes subsequent control changes refine live (below).
  const triggerSearch = useCallback(() => {
    setArmed(true);
    void runSearch();
  }, [runSearch]);

  // Once armed, re-run (debounced) on any param change — live refinement while
  // the user is actively searching. Skipped when the current key was already
  // searched (cache hit). An in-flight request is never aborted here; closing
  // the popover just stops scheduling new ones and the running one finishes.
  useEffect(() => {
    if (!open || !armed) return;
    if (!hasQuery) {
      runSearch();
      return;
    }
    if (searchedKeyRef.current === key) return; // already searched/searching
    const t = setTimeout(runSearch, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, armed, hasQuery, key, runSearch]);

  // Reset armed whenever the popover closes so the next open starts inert,
  // showing cached results (if the params still match) without auto-searching.
  useEffect(() => {
    if (!open) setArmed(false);
  }, [open]);

  // Hydrate from the persistent cache on mount: if these exact params were
  // searched before (even in a prior mount/HMR generation), show the results
  // immediately instead of requiring a fresh "Find". Mount-only by design.
  useEffect(() => {
    const cached = searchCache.get(key);
    if (cached && searchedKeyRef.current !== key) {
      searchedKeyRef.current = key;
      setResults(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = hasQuery && searchedKeyRef.current !== key;

  return {
    threshold,
    setThreshold,
    limit,
    setLimit,
    familyId,
    setFamilyId,
    hybrid,
    setHybrid,
    triggerSearch,
    armed,
    query,
    results,
    loading,
    error,
    hasQuery,
    stale,
  };
}
