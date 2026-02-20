/**
 * useVocabResolver — resolve vocabulary IDs in tag values to human-readable labels.
 *
 * When a tag value matches `prefix:suffix` and `prefix` is a known concept kind,
 * the hook lazily fetches concepts for that kind and returns the label.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getConceptKinds, getConcepts } from '@lib/api/concepts';

export interface ResolvedTag {
  label: string;
  isVocab: boolean;
}

export function useVocabResolver() {
  const knownKindsRef = useRef<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, Map<string, string>>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Fetch concept kinds on mount
  useEffect(() => {
    getConceptKinds()
      .then((response) => {
        const kinds = new Set(response.kinds.map((k) => k.kind));
        knownKindsRef.current = kinds;
      })
      .catch(() => {
        // Silently ignore — vocab resolution is best-effort
      });
  }, []);

  const fetchKind = useCallback(async (kind: string) => {
    if (cacheRef.current.has(kind) || pendingRef.current.has(kind)) return;
    pendingRef.current.add(kind);

    try {
      const response = await getConcepts(kind);
      const map = new Map<string, string>();
      for (const concept of response.concepts) {
        map.set(concept.id, concept.label);
      }
      cacheRef.current.set(kind, map);
      setTick((t) => t + 1);
    } catch {
      // Best-effort — fall back to raw value
    } finally {
      pendingRef.current.delete(kind);
    }
  }, []);

  const resolveTagValue = useCallback(
    (raw: string): ResolvedTag => {
      const colonIdx = raw.indexOf(':');
      if (colonIdx === -1) return { label: raw, isVocab: false };

      const prefix = raw.slice(0, colonIdx);
      const suffix = raw.slice(colonIdx + 1);

      if (!knownKindsRef.current.has(prefix)) return { label: raw, isVocab: false };

      const kindCache = cacheRef.current.get(prefix);
      if (!kindCache) {
        // Trigger lazy fetch
        fetchKind(prefix);
        return { label: raw, isVocab: false };
      }

      // Try full ID first, then just the suffix
      const label = kindCache.get(raw) ?? kindCache.get(suffix);
      if (label) return { label, isVocab: true };

      return { label: raw, isVocab: false };
    },
    [fetchKind],
  );

  return { resolveTagValue };
}
