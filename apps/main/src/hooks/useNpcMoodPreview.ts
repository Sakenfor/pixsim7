import { useEffect, useState } from 'react';

import {
  previewMoodState,
  type PreviewMoodEmotionalState,
  type PreviewMoodRelationshipValues,
} from '@lib/api/npcMood';
import type { MoodState } from '@pixsim7/game.engine';

export interface UseNpcMoodPreviewOptions {
  worldId: number | null;
  npcId: number | null;
  sessionId?: number | null;
  relationshipValues?: PreviewMoodRelationshipValues;
  emotionalState?: PreviewMoodEmotionalState;
  autoFetch?: boolean;
}

export interface UseNpcMoodPreviewResult {
  mood: MoodState | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useNpcMoodPreview(
  options: UseNpcMoodPreviewOptions
): UseNpcMoodPreviewResult {
  const {
    worldId,
    npcId,
    sessionId,
    relationshipValues,
    emotionalState,
    autoFetch = true,
  } = options;

  const [mood, setMood] = useState<MoodState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = async () => {
    if (!worldId || !npcId) {
      setMood(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await previewMoodState({
        worldId,
        npcId,
        sessionId: sessionId ?? undefined,
        relationshipValues,
        emotionalState,
      });
      setMood(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setMood(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch) {
      void fetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    worldId,
    npcId,
    sessionId,
    autoFetch,
    relationshipValues?.affinity,
    relationshipValues?.trust,
    relationshipValues?.chemistry,
    relationshipValues?.tension,
    emotionalState?.emotion,
    emotionalState?.intensity,
  ]);

  return { mood, loading, error, refetch: fetch };
}
