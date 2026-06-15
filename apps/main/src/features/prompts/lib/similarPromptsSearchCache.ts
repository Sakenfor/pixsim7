/**
 * Shared, cross-remount cache for the *expensive* semantic vector search.
 *
 * Every consumer of `searchSimilarPrompts` (the prompt-similarity popover via
 * `useSimilarPromptsSearch`, the variant-suggestions neighbour step via
 * `useVariantOutcomes`, and any future caller) routes through this so identical
 * searches — even across different features — hit one cache entry and de-dupe
 * in flight. The embedding + pgvector lookup is the costly part; this makes it
 * paid once per distinct param set per session instead of per mount/per feature.
 *
 * Bounded LRU so the key space can't grow unbounded across a long session.
 */

import { searchSimilarPrompts, type SearchSimilarPromptsQuery, type SimilarPromptMatch } from '@lib/api/prompts';
import { createKeyedAsyncCache } from '@lib/utils';

const cache = createKeyedAsyncCache<SimilarPromptMatch[]>('searchSimilarPrompts', {
  maxEntries: 50,
});

/**
 * `rank` is accepted by the backend but isn't on the generated query type — it
 * rides along via object spread at the call sites. Model it explicitly here so
 * the cache key distinguishes hybrid vs similarity rankings.
 */
export type SimilarPromptsQuery = SearchSimilarPromptsQuery & { rank?: string };

export function similarPromptsCacheKey(query: SimilarPromptsQuery): string {
  return [
    query.prompt?.trim() ?? '',
    query.mode ?? 'vector',
    query.limit ?? '',
    query.threshold ?? '',
    query.rank ?? '',
    query.family_id ?? '',
  ].join('|');
}

/** Cached + in-flight-de-duped semantic search; resolves to just the matches. */
export function searchSimilarPromptsCached(query: SimilarPromptsQuery): Promise<SimilarPromptMatch[]> {
  return cache.fetch(similarPromptsCacheKey(query), () =>
    searchSimilarPrompts(query).then((res) => res.results),
  );
}

/** Peek at a cached result without triggering a fetch (undefined if absent). */
export function peekSimilarPrompts(query: SimilarPromptsQuery): SimilarPromptMatch[] | undefined {
  return cache.get(similarPromptsCacheKey(query));
}
