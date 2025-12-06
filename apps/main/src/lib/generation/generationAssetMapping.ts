/**
 * Generation-Asset Mapping
 *
 * Maps generation IDs to asset IDs and provides helpers for
 * surfacing generation status in media galleries.
 */
import type { GenerationResponse } from '../api/generations';
import { isGenerationActive, isGenerationTerminal, type GenerationStatus } from '@/stores/generationsStore';

export interface GenerationStatusInfo {
  generationId: number;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  providerId: string;
  operationType: string;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  retryCount: number;
}

/**
 * Maps asset ID to generation status info
 */
export function mapAssetToGeneration(
  assetId: number,
  generations: GenerationResponse[]
): GenerationStatusInfo | undefined {
  // Find the most recent generation for this asset
  const gen = generations
    .filter(g => g.asset_id === assetId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  if (!gen) return undefined;

  return {
    generationId: gen.id,
    status: gen.status,
    providerId: gen.provider_id,
    operationType: gen.operation_type,
    errorMessage: gen.error_message,
    startedAt: gen.started_at,
    completedAt: gen.completed_at,
    retryCount: gen.retry_count,
  };
}

/**
 * Get all assets that have active (non-terminal) generations
 */
export function getAssetsWithActiveGenerations(
  generations: GenerationResponse[]
): Set<number> {
  const assetIds = new Set<number>();

  for (const gen of generations) {
    if (gen.asset_id && isGenerationActive(gen.status)) {
      assetIds.add(gen.asset_id);
    }
  }

  return assetIds;
}

/**
 * Get all assets that have failed generations
 */
export function getAssetsWithFailedGenerations(
  generations: GenerationResponse[]
): Set<number> {
  const assetIds = new Set<number>();

  for (const gen of generations) {
    if (gen.asset_id && gen.status === 'failed') {
      assetIds.add(gen.asset_id);
    }
  }

  return assetIds;
}

/**
 * Get status display info (for badges/tooltips)
 */
export function getGenerationStatusDisplay(
  status: GenerationStatusInfo['status']
): {
  label: string;
  icon: string;
  color: string;
  description: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        icon: 'clock',
        color: 'text-yellow-600 dark:text-yellow-400',
        description: 'Waiting to start',
      };
    case 'queued':
      return {
        label: 'Queued',
        icon: 'layers',
        color: 'text-blue-600 dark:text-blue-400',
        description: 'In queue',
      };
    case 'processing':
      return {
        label: 'Processing',
        icon: 'loader',
        color: 'text-blue-600 dark:text-blue-400',
        description: 'Generation in progress',
      };
    case 'completed':
      return {
        label: 'Completed',
        icon: 'check-circle',
        color: 'text-green-600 dark:text-green-400',
        description: 'Generation complete',
      };
    case 'failed':
      return {
        label: 'Failed',
        icon: 'alert-circle',
        color: 'text-red-600 dark:text-red-400',
        description: 'Generation failed',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: 'x-circle',
        color: 'text-neutral-600 dark:text-neutral-400',
        description: 'Generation cancelled',
      };
  }
}

// Re-export for backwards compatibility
// Prefer importing directly from '@/stores/generationsStore'
export { isGenerationTerminal as isGenerationStatusTerminal } from '@/stores/generationsStore';
