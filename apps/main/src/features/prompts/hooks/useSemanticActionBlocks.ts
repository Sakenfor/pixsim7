import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  findSimilarActionBlocksByText,
  type SimilarActionBlockMatch,
} from '@lib/api/actionBlocks';

import { usePromptSettingsStore } from '../stores/promptSettingsStore';

const DEFAULT_MIN_CHARS = 16;
const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_CACHE_TTL_MS = 90_000;

interface CacheEntry {
  timestamp: number;
  results: SimilarActionBlockMatch[];
}

export interface UseSemanticActionBlocksOptions {
  enabled?: boolean;
  limit?: number;
  threshold?: number;
  modelId?: string;
  role?: string;
  kind?: string;
  category?: string;
  minChars?: number;
  debounceMs?: number;
  cacheTtlMs?: number;
}

export interface SemanticActionBlocksState {
  results: SimilarActionBlockMatch[];
  loading: boolean;
  error: string | null;
  hasResults: boolean;
  refresh: () => void;
}

function buildCacheKey(
  query: string,
  params: {
    modelId?: string;
    role?: string;
    kind?: string;
    category?: string;
    limit: number;
    threshold: number;
  }
): string {
  return JSON.stringify({
    query,
    modelId: params.modelId || '',
    role: params.role || '',
    kind: params.kind || '',
    category: params.category || '',
    limit: params.limit,
    threshold: params.threshold,
  });
}

export function useSemanticActionBlocks(
  queryText: string,
  options: UseSemanticActionBlocksOptions = {}
): SemanticActionBlocksState {
  const semanticEnabled = usePromptSettingsStore((state) => state.semanticEnabled);
  const semanticLimit = usePromptSettingsStore((state) => state.semanticLimit);
  const semanticThreshold = usePromptSettingsStore((state) => state.semanticThreshold);
  const semanticModelId = usePromptSettingsStore((state) => state.semanticModelId);

  const [results, setResults] = useState<SimilarActionBlockMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const requestIdRef = useRef(0);

  const refresh = useCallback(() => {
    cacheRef.current.clear();
    setRefreshToken((prev) => prev + 1);
  }, []);

  const query = useMemo(() => queryText.trim(), [queryText]);

  const enabled = options.enabled ?? semanticEnabled;
  const limit = options.limit ?? semanticLimit;
  const threshold = options.threshold ?? semanticThreshold;
  const modelId = options.modelId ?? semanticModelId ?? undefined;
  const role = options.role;
  const kind = options.kind;
  const category = options.category;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  useEffect(() => {
    if (!enabled || query.length < minChars) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const cacheKey = buildCacheKey(query, {
      modelId,
      role,
      kind,
      category,
      limit,
      threshold,
    });

    const timeoutId = window.setTimeout(async () => {
      const now = Date.now();
      const cached = cacheRef.current.get(cacheKey);
      if (cached && now - cached.timestamp < cacheTtlMs) {
        setResults(cached.results);
        setLoading(false);
        setError(null);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const semanticResults = await findSimilarActionBlocksByText({
          text: query,
          model_id: modelId,
          role,
          kind,
          category,
          limit,
          threshold,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        cacheRef.current.set(cacheKey, {
          timestamp: Date.now(),
          results: semanticResults,
        });

        setResults(semanticResults);
        setLoading(false);
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to fetch semantic matches';
        setError(message);
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    cacheTtlMs,
    category,
    debounceMs,
    enabled,
    kind,
    limit,
    minChars,
    modelId,
    query,
    refreshToken,
    role,
    threshold,
  ]);

  return {
    results,
    loading,
    error,
    hasResults: results.length > 0,
    refresh,
  };
}
