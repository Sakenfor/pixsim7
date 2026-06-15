/**
 * useVariantOutcomes — "this word has proven variations" suggestions for the
 * composer.
 *
 * Two-step, run when the popover opens with a non-empty prompt:
 *   1. vector similar-search → a tight neighbour set (version ids of prompts
 *      close to the current text).
 *   2. POST /prompts/variant-outcomes over those ids → variable slots, each
 *      filler word ranked by status-based completion rate.
 *
 * We surface the clean `word` + `interior` slots by default (genuine
 * lowercase-prose substitutions with context on both sides — the noise pass on
 * the backend already drops spacing/typo/truncation artifacts). A toggle widens
 * to all kinds (DSL token edits, caps content) for power users.
 *
 * Lives alongside useSimilarPromptsSearch; mirrors its "state survives
 * open/close, in-flight request isn't abandoned" shape but is simpler — it
 * fetches on open rather than on an explicit Find.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchVariantOutcomes, type VariantSlot } from '@lib/api/prompts';

import { searchSimilarPromptsCached } from '../lib/similarPromptsSearchCache';

const DEBOUNCE_MS = 350;
/** Neighbour search: tight enough to cluster, wide enough to find variations. */
const NEIGHBOUR_THRESHOLD = 0.78;
const NEIGHBOUR_LIMIT = 30;
/** Each filler needs at least this many terminal generations to earn a rate. */
const MIN_VALUE_GENS = 5;

export type VariantOutcomesScope = 'clean' | 'all';

export interface VariantOutcomes {
  /** 'clean' = word-kind + interior only; 'all' = every actionable slot. */
  scope: VariantOutcomesScope;
  setScope: (value: VariantOutcomesScope) => void;
  /** Slots filtered by `scope`, highest delta first. */
  slots: VariantSlot[];
  /** Total actionable slots before scope filtering. */
  totalSlots: number;
  loading: boolean;
  error: string | null;
  hasQuery: boolean;
  /** Neighbour versions the slots were induced from. */
  neighbourCount: number;
}

const inScope = (s: VariantSlot, scope: VariantOutcomesScope): boolean =>
  scope === 'all' ? true : s.kind === 'word' && s.interior;

export function useVariantOutcomes({
  promptText,
  open,
}: {
  promptText: string;
  open: boolean;
}): VariantOutcomes {
  const [scope, setScope] = useState<VariantOutcomesScope>('clean');
  const [slots, setSlots] = useState<VariantSlot[]>([]);
  const [neighbourCount, setNeighbourCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  // Param key the current results belong to — skips redundant re-fetches when
  // reopening with the same text.
  const fetchedKeyRef = useRef<string | null>(null);

  const query = promptText.trim();
  const hasQuery = query.length > 0;

  const run = useCallback(async () => {
    if (!hasQuery) {
      reqIdRef.current++;
      fetchedKeyRef.current = null;
      setSlots([]);
      setNeighbourCount(0);
      setError(null);
      setLoading(false);
      return;
    }
    fetchedKeyRef.current = query;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const neighbours = await searchSimilarPromptsCached({
        prompt: query,
        mode: 'vector',
        limit: NEIGHBOUR_LIMIT,
        threshold: NEIGHBOUR_THRESHOLD,
      });
      if (reqId !== reqIdRef.current) return;
      const versionIds = neighbours.map((r) => r.version_id);
      setNeighbourCount(versionIds.length);
      if (versionIds.length < 2) {
        setSlots([]);
        setLoading(false);
        return;
      }
      const res = await fetchVariantOutcomes({
        version_ids: versionIds,
        min_value_gens: MIN_VALUE_GENS,
        qualifying_only: true,
      });
      if (reqId !== reqIdRef.current) return;
      setSlots(res.slots);
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setSlots([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [hasQuery, query]);

  // Fetch when opened (debounced); skip if the same text already produced these
  // results. Closing mid-flight lets the request finish (reqId guards staleness).
  useEffect(() => {
    if (!open) return;
    if (!hasQuery) {
      void run();
      return;
    }
    if (fetchedKeyRef.current === query) return;
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, hasQuery, query, run]);

  const scoped = slots.filter((s) => inScope(s, scope));
  scoped.sort((a, b) => b.delta - a.delta);

  return {
    scope,
    setScope,
    slots: scoped,
    totalSlots: slots.length,
    loading,
    error,
    hasQuery,
    neighbourCount,
  };
}
