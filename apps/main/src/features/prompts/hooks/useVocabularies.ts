/**
 * Fetches vocabulary members from `/api/v1/prompts/meta/vocabularies` so the
 * prompt editor can recognise + autocomplete variable facets against real
 * VocabRegistry data (anatomy `parts`, `poses`, `locations`, `camera`, …)
 * instead of guessing. Cached at module level per requested type-set — the
 * data is static during a session.
 *
 * Backend authority: the unified VocabRegistry. The frontend reads this hook's
 * result rather than duplicating any vocab values. Sister to
 * `useOperatorVocabulary` (same fetch-once-and-cache shape).
 */
import { useEffect, useState } from 'react';

import { useApi } from '@/hooks/useApi';

export interface VocabItem {
  id: string;
  label: string;
  category: string;
  keywords: string[];
}

/** Vocab members keyed by vocab-type (e.g. `parts`, `poses`). */
export type Vocabularies = Record<string, VocabItem[]>;

interface VocabulariesResponse {
  vocabularies?: Array<{
    type: string;
    items?: Array<{ id: string; label: string; category?: string; keywords?: string[] }>;
  }>;
}

const EMPTY: Vocabularies = {};

/** Canonical cache key for a set of requested types (order-insensitive). */
function cacheKey(types: readonly string[]): string {
  return Array.from(new Set(types.map((t) => t.trim()).filter(Boolean))).sort().join(',');
}

const cache = new Map<string, Vocabularies>();
const inflight = new Map<string, Promise<Vocabularies>>();

async function fetchVocabularies(
  api: ReturnType<typeof useApi>,
  key: string,
): Promise<Vocabularies> {
  const hit = cache.get(key);
  if (hit) return hit;
  const existing = inflight.get(key);
  if (existing) return existing;

  const query = key ? `?types=${encodeURIComponent(key)}` : '';
  const promise = api
    .get<VocabulariesResponse>(`/prompts/meta/vocabularies${query}`)
    .then((data) => {
      const result: Vocabularies = {};
      for (const vt of data?.vocabularies ?? []) {
        if (!vt?.type) continue;
        result[vt.type] = (vt.items ?? []).map((it) => ({
          id: it.id,
          label: it.label,
          category: it.category ?? '',
          keywords: Array.isArray(it.keywords) ? it.keywords : [],
        }));
      }
      cache.set(key, result);
      inflight.delete(key);
      return result;
    })
    .catch(() => {
      inflight.delete(key);
      return EMPTY;
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Fetch (and cache) vocab members for the given vocab types. Pass the types a
 * surface needs (e.g. the facet axes' vocab categories); an empty list fetches
 * all known types. Returns `{}` until the first response resolves.
 */
export function useVocabularies(types: readonly string[]): Vocabularies {
  const api = useApi();
  const key = cacheKey(types);
  const [vocab, setVocab] = useState<Vocabularies>(() => cache.get(key) ?? EMPTY);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setVocab(hit);
      return;
    }
    let active = true;
    fetchVocabularies(api, key).then((v) => {
      if (active) setVocab(v);
    });
    return () => {
      active = false;
    };
  }, [api, key]);

  return vocab;
}
