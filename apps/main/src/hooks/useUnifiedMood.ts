import { useEffect, useState } from 'react';
import { previewUnifiedMood } from '@pixsim7/game.engine';
import type { UnifiedMoodState } from '@/types';

interface UseUnifiedMoodArgs {
  worldId: number;
  npcId: number;
  sessionId?: number;
  relationshipValues?: {
    affinity: number;
    trust: number;
    chemistry: number;
    tension: number;
  };
  intimacyLevelId?: string | null;
}

interface UseUnifiedMoodResult {
  data: UnifiedMoodState | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch unified NPC mood (general + intimacy + active emotion) for a given NPC/session.
 *
 * This is intended for dev/debug tools (e.g. Mood Debug panel) rather than
 * latency-critical gameplay paths.
 */
export function useUnifiedMood(args: UseUnifiedMoodArgs): UseUnifiedMoodResult {
  const [data, setData] = useState<UnifiedMoodState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { worldId, npcId, sessionId, relationshipValues, intimacyLevelId } = args;

  useEffect(() => {
    // Require at least world + npc + session to run
    if (!worldId || !npcId || !sessionId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    previewUnifiedMood({
      worldId,
      npcId,
      sessionId,
      relationshipValues,
      intimacyLevelId: intimacyLevelId ?? undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    worldId,
    npcId,
    sessionId,
    relationshipValues?.affinity,
    relationshipValues?.trust,
    relationshipValues?.chemistry,
    relationshipValues?.tension,
    intimacyLevelId,
  ]);

  return { data, loading, error };
}

