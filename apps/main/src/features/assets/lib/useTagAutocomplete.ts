import { useEffect, useRef, useState } from 'react';

import { listTags, type TagSummary } from '@lib/api/tags';

import { cleanTagPart, DEFAULT_NAMESPACE } from './quickTag';

export const TAG_NAMESPACES = [
  'user',
  'content',
  'style',
  'project',
  'source',
  'provider',
  'operation',
  'site',
  'character',
  'location',
  'camera',
  'lighting',
  'mood',
] as const;

const DEBOUNCE_MS = 300;
const MIN_CHARS = 1;
const DEFAULT_LIMIT = 15;

export interface ParsedTagInput {
  namespace: string;
  query: string;
  hasExplicitNamespace: boolean;
}

/**
 * Parse raw tag input to detect colon namespace syntax.
 *
 * Examples:
 * - `"good"` → `{ namespace: "user", query: "good", hasExplicitNamespace: false }`
 * - `"style:"` → `{ namespace: "style", query: "", hasExplicitNamespace: true }`
 * - `"style:cinematic"` → `{ namespace: "style", query: "cinematic", hasExplicitNamespace: true }`
 */
export function parseTagInput(raw: string): ParsedTagInput {
  const trimmed = raw.trim().toLowerCase();

  if (trimmed.includes(':')) {
    const [ns, ...rest] = trimmed.split(':');
    const cleanNs = cleanTagPart(ns);
    const query = cleanTagPart(rest.join(':'));
    return {
      namespace: cleanNs || DEFAULT_NAMESPACE,
      query,
      hasExplicitNamespace: !!cleanNs,
    };
  }

  return {
    namespace: DEFAULT_NAMESPACE,
    query: cleanTagPart(trimmed),
    hasExplicitNamespace: false,
  };
}

export interface UseTagAutocompleteOptions {
  enabled?: boolean;
  limit?: number;
}

export interface UseTagAutocompleteResult {
  results: TagSummary[];
  loading: boolean;
  parsedNamespace: string;
  parsedQuery: string;
  hasExplicitNamespace: boolean;
}

export function useTagAutocomplete(
  inputText: string,
  options: UseTagAutocompleteOptions = {},
): UseTagAutocompleteResult {
  const { enabled = true, limit = DEFAULT_LIMIT } = options;

  const [results, setResults] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const parsed = parseTagInput(inputText);

  useEffect(() => {
    if (!enabled || parsed.query.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timeoutId = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;

      try {
        const response = await listTags({
          q: parsed.query,
          namespace: parsed.hasExplicitNamespace ? parsed.namespace : undefined,
          limit,
        });

        if (requestId !== requestIdRef.current) return;

        setResults(response.tags as TagSummary[]);
        setLoading(false);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setResults([]);
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, parsed.query, parsed.namespace, parsed.hasExplicitNamespace, limit]);

  return {
    results,
    loading,
    parsedNamespace: parsed.namespace,
    parsedQuery: parsed.query,
    hasExplicitNamespace: parsed.hasExplicitNamespace,
  };
}
