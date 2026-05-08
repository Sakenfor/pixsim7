/**
 * useInteractionSuggestions
 *
 * Wraps `useInteractions` (server-side list of available interactions for an
 * NPC + session) and pipes the results through the engine's
 * `generateSuggestions()` scorer to produce ranked, explained suggestions for
 * the UI.
 *
 * Optional context (relationship, mood, chains, etc.) is forwarded to the
 * scorer; sections of context that are omitted simply produce neutral scoring
 * for that dimension.
 */
import { useMemo } from 'react';

import {
  generateSuggestions,
  type InteractionSuggestion,
  type SuggestionConfig,
} from '@pixsim7/game.engine';

import { useInteractions } from './useInteractions';

type SuggestionContext = Parameters<typeof generateSuggestions>[1];

export interface UseInteractionSuggestionsOptions {
  worldId: number | null;
  sessionId: number | null;
  npcId: number | null;
  locationId?: number | null;
  context?: SuggestionContext;
  config?: SuggestionConfig;
  autoFetch?: boolean;
}

export interface UseInteractionSuggestionsResult {
  suggestions: InteractionSuggestion[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useInteractionSuggestions(
  options: UseInteractionSuggestionsOptions
): UseInteractionSuggestionsResult {
  const {
    worldId,
    sessionId,
    npcId,
    locationId,
    context,
    config,
    autoFetch = true,
  } = options;

  const target = npcId
    ? { ref: `npc:${npcId}`, kind: 'npc' as const, id: npcId }
    : null;

  const { available, loading, error, refetch } = useInteractions({
    worldId,
    sessionId,
    target,
    locationId,
    autoFetch,
  });

  const suggestions = useMemo(() => {
    if (!available.length) return [];
    return generateSuggestions(available, context ?? {}, config);
  }, [available, context, config]);

  return { suggestions, loading, error, refetch };
}
