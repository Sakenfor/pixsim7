/**
 * useSavedFacets — user-registered class-wide facets.
 *
 * A facet (the token after the first `_`, e.g. `METHODS` in `ACTOR1_METHODS`) is
 * normally recognised only when it's a declared axis or a vocab value.
 * Registering one here makes it recognised *class-wide* — every `ACTOR1_METHODS`
 * / `ACTOR2_METHODS` reads as known, decorates as known, and is offered in
 * autocomplete. Backed by `/prompts/meta/facets` (user-pref persistence).
 *
 * Cross-instance synced (like `usePromptVariables`) so a register/unregister in
 * one surface refreshes every consumer's recognition. Exposes the registry as a
 * stable `Set` of `CLASS:FACET` keys (see `facetKey`) ready to thread into
 * `resolveFacet` / `suggestFacets` / the variable-token extension.
 */
import type { SavedFacetsResponse, UpsertFacetRequest } from '@pixsim7/shared.api.model';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useApi } from '@/hooks/useApi';

import { facetKey } from '../lib/facetRecognition';

type FacetMap = Record<string, string[]>;

let cachedMap: FacetMap | null = null;
let inflightFetch: Promise<FacetMap> | null = null;
const listeners = new Set<(m: FacetMap) => void>();

function publish(next: FacetMap): void {
  cachedMap = next;
  listeners.forEach((listener) => listener(next));
}

function normalizeMap(payload: SavedFacetsResponse | null | undefined): FacetMap {
  const raw = payload?.facets;
  const out: FacetMap = {};
  if (raw && typeof raw === 'object') {
    for (const [cls, tokens] of Object.entries(raw)) {
      if (!Array.isArray(tokens)) continue;
      out[cls.trim().toUpperCase()] = tokens.map((t) => String(t).trim().toUpperCase());
    }
  }
  return out;
}

function toKeySet(map: FacetMap): Set<string> {
  const set = new Set<string>();
  for (const [cls, tokens] of Object.entries(map)) {
    for (const token of tokens) set.add(facetKey(cls, token));
  }
  return set;
}

async function fetchFacets(api: ReturnType<typeof useApi>): Promise<FacetMap> {
  if (cachedMap) return cachedMap;
  if (inflightFetch) return inflightFetch;
  inflightFetch = api
    .get<SavedFacetsResponse>('/prompts/meta/facets')
    .then((payload) => {
      const map = normalizeMap(payload);
      cachedMap = map;
      inflightFetch = null;
      return map;
    })
    .catch(() => {
      inflightFetch = null;
      return {};
    });
  return inflightFetch;
}

export interface FacetMutationResult {
  ok: boolean;
  message?: string;
}

export function useSavedFacets() {
  const api = useApi();
  const [map, setMap] = useState<FacetMap>(cachedMap ?? {});

  // Subscribe to cross-instance updates for this hook's lifetime.
  useEffect(() => {
    listeners.add(setMap);
    if (cachedMap) setMap(cachedMap);
    return () => {
      listeners.delete(setMap);
    };
  }, []);

  useEffect(() => {
    if (cachedMap) return;
    let active = true;
    fetchFacets(api).then((m) => {
      if (active) setMap(m);
    });
    return () => {
      active = false;
    };
  }, [api]);

  // Stable key set (same ref until the map changes) so it can feed the CM
  // extension config without churning the decoration memo every render.
  const savedFacets = useMemo<ReadonlySet<string>>(() => toKeySet(map), [map]);

  const registerFacet = useCallback(
    async (className: string, facet: string): Promise<FacetMutationResult> => {
      try {
        const body: UpsertFacetRequest = { class_name: className, facet };
        const payload = await api.post<SavedFacetsResponse>('/prompts/meta/facets', body);
        publish(normalizeMap(payload));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as Error)?.message };
      }
    },
    [api],
  );

  const unregisterFacet = useCallback(
    async (className: string, facet: string): Promise<FacetMutationResult> => {
      try {
        const payload = await api.delete<SavedFacetsResponse>(
          `/prompts/meta/facets/${encodeURIComponent(className.trim().toUpperCase())}/${encodeURIComponent(
            facet.trim().toUpperCase(),
          )}`,
        );
        publish(normalizeMap(payload));
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as Error)?.message };
      }
    },
    [api],
  );

  return { savedFacets, registerFacet, unregisterFacet };
}
