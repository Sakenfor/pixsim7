/**
 * Hook for managing pending dialogue requests from NPC interactions
 *
 * This hook automatically polls for pending dialogue requests created by
 * NPC interactions and provides methods to execute them via the LLM.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getPendingDialogue,
  executePendingDialogue,
  clearPendingDialogue,
} from '../api/interactions';

export interface PendingDialogueRequest {
  requestId: string;
  npcId: number;
  programId: string;
  systemPrompt?: string;
  llmPrompt: string;
  visualPrompt?: string;
  playerInput?: string;
  branchIntent?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ExecutedDialogue {
  text: string;
  cached: boolean;
  generationTimeMs?: number;
  requestId: string;
}

export interface UsePendingDialogueOptions {
  sessionId: number;
  /** Auto-execute pending dialogues (default: false) */
  autoExecute?: boolean;
  /** Polling interval in ms (default: 2000) */
  pollInterval?: number;
  /** Callback when dialogue is executed */
  onDialogueExecuted?: (result: ExecutedDialogue) => void;
}

export interface UsePendingDialogueResult {
  /** Pending dialogue requests */
  pending: PendingDialogueRequest[];
  /** Whether currently fetching */
  loading: boolean;
  /** Fetch error if any */
  error: Error | null;
  /** Execute a pending dialogue request */
  execute: (requestId: string) => Promise<ExecutedDialogue>;
  /** Clear a pending dialogue without executing */
  clear: (requestId: string) => Promise<void>;
  /** Manually refresh pending list */
  refresh: () => Promise<void>;
  /** Executing state per request ID */
  executing: Record<string, boolean>;
}

export function usePendingDialogue(
  options: UsePendingDialogueOptions
): UsePendingDialogueResult {
  const {
    sessionId,
    autoExecute = false,
    pollInterval = 2000,
    onDialogueExecuted,
  } = options;

  const [pending, setPending] = useState<PendingDialogueRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [executing, setExecuting] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);
      const requests = await getPendingDialogue(sessionId);
      setPending(requests);

      // Auto-execute if enabled
      if (autoExecute && requests.length > 0) {
        for (const request of requests) {
          if (!executing[request.requestId]) {
            await execute(request.requestId);
          }
        }
      }
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch pending dialogue:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, autoExecute]);

  const execute = useCallback(
    async (requestId: string): Promise<ExecutedDialogue> => {
      try {
        setExecuting((prev) => ({ ...prev, [requestId]: true }));
        const result = await executePendingDialogue(sessionId, requestId);

        // Clear from pending list
        await clearPendingDialogue(sessionId, requestId);

        // Refresh pending list
        await refresh();

        // Callback
        if (onDialogueExecuted) {
          onDialogueExecuted(result);
        }

        return result;
      } catch (err) {
        console.error(`Failed to execute dialogue ${requestId}:`, err);
        throw err;
      } finally {
        setExecuting((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
      }
    },
    [sessionId, onDialogueExecuted, refresh]
  );

  const clear = useCallback(
    async (requestId: string): Promise<void> => {
      try {
        await clearPendingDialogue(sessionId, requestId);
        await refresh();
      } catch (err) {
        console.error(`Failed to clear dialogue ${requestId}:`, err);
        throw err;
      }
    },
    [sessionId, refresh]
  );

  // Poll for pending dialogues
  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, pollInterval);

    return () => clearInterval(interval);
  }, [sessionId, pollInterval, refresh]);

  return {
    pending,
    loading,
    error,
    execute,
    clear,
    refresh,
    executing,
  };
}
