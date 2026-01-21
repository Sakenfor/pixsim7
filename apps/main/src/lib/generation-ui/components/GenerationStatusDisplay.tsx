/**
 * GenerationStatusDisplay Component
 *
 * Displays generation status with WebSocket updates and retry support.
 * Shows status, progress, error messages, and retry button for failed generations.
 */

import { useState, useEffect } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';
import { logEvent } from '@lib/utils/logging';

import {
  useGenerationsStore,
  isGenerationTerminal,
  getStatusContainerClasses,
  fromGenerationResponse,
} from '@features/generation';

/** Polling interval for backup status checks (ms) */
const POLL_INTERVAL = 5000;

/** Maximum retry attempts */
const MAX_RETRIES = 10;

interface GenerationStatusDisplayProps {
  generationId: number;
}

export function GenerationStatusDisplay({ generationId }: GenerationStatusDisplayProps) {
  const generation = useGenerationsStore(s => s.generations.get(generationId));
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const [retrying, setRetrying] = useState(false);

  // Fallback polling if WebSocket disconnects (backup only)
  useEffect(() => {
    if (!generationId) return;

    // Check if generation is in terminal state
    if (generation && isGenerationTerminal(generation.status)) {
      return;
    }

    // Poll every 5 seconds as backup (WebSocket is primary)
    const interval = setInterval(async () => {
      try {
        const { getGeneration } = await import('@/lib/api/generations');
        const updated = await getGeneration(generationId);
        addOrUpdateGeneration(fromGenerationResponse(updated));

        if (isGenerationTerminal(updated.status)) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error(`Failed to poll generation ${generationId}:`, err);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [generationId, generation?.status, addOrUpdateGeneration]);

  async function handleRetry() {
    if (!generation || retrying) return;

    setRetrying(true);
    try {
      const { retryGeneration } = await import('@/lib/api/generations');
      const newGeneration = await retryGeneration(generationId);

      // Update store with new generation
      addOrUpdateGeneration(fromGenerationResponse(newGeneration));

      // Log the retry event
      setTimeout(() => {
        logEvent('INFO', 'generation_retried', {
          originalId: generationId,
          newId: newGeneration.id,
        });
      }, 1000);
    } catch (err) {
      console.error(`Failed to retry generation ${generationId}:`, err);
      alert(extractErrorMessage(err, 'Failed to retry generation'));
    } finally {
      setRetrying(false);
    }
  }

  if (!generation) {
    return (
      <div className="text-xs p-2 bg-neutral-100 dark:bg-neutral-800 rounded">
        Generation #{generationId} (loading...)
      </div>
    );
  }

  const statusColor = getStatusContainerClasses(generation.status);
  const canRetry = generation.status === 'failed' && generation.retryCount < MAX_RETRIES;

  return (
    <div className={`text-xs p-2 border rounded ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium">Generation #{generationId}</div>
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Retry this generation (useful for content filter rejections)"
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        )}
      </div>
      <div className="mt-1">Status: {generation.status}</div>
      {generation.retryCount > 0 && (
        <div className="mt-1 text-xs opacity-75">
          Retry attempt: {generation.retryCount}/{MAX_RETRIES}
        </div>
      )}
      {generation.errorMessage && (
        <div className="mt-1 text-red-600 dark:text-red-400">
          Error: {generation.errorMessage}
        </div>
      )}
      {generation.assetId && (
        <div className="mt-1">Asset ID: {generation.assetId}</div>
      )}
    </div>
  );
}
