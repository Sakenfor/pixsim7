/**
 * GenerationStatusDisplay Component
 *
 * Displays generation status with WebSocket updates and retry support.
 * Shows status, progress, error messages, and retry button for failed generations.
 */

import { useState, useEffect } from 'react';
import { useGenerationsStore, isGenerationTerminal } from '@/stores/generationsStore';
import { logEvent } from '@/lib/logging';

/** Status color mapping */
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
  processing: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  completed: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
  failed: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  cancelled: 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300',
};

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
        addOrUpdateGeneration(updated);

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
      addOrUpdateGeneration(newGeneration);

      // Log the retry event
      setTimeout(() => {
        logEvent('INFO', 'generation_retried', {
          originalId: generationId,
          newId: newGeneration.id,
        });
      }, 1000);
    } catch (err: any) {
      console.error(`Failed to retry generation ${generationId}:`, err);
      alert(err.response?.data?.detail || 'Failed to retry generation');
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

  const statusColor = STATUS_COLORS[generation.status] || STATUS_COLORS.pending;
  const canRetry = generation.status === 'failed' && generation.retry_count < MAX_RETRIES;

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
      {generation.retry_count > 0 && (
        <div className="mt-1 text-xs opacity-75">
          Retry attempt: {generation.retry_count}/{MAX_RETRIES}
        </div>
      )}
      {generation.error_message && (
        <div className="mt-1 text-red-600 dark:text-red-400">
          Error: {generation.error_message}
        </div>
      )}
      {generation.asset_id && (
        <div className="mt-1">Asset ID: {generation.asset_id}</div>
      )}
    </div>
  );
}
