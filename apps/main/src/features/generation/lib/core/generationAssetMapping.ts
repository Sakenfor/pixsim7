/**
 * Generation-Asset Mapping
 *
 * Maps generation IDs to asset IDs and provides helpers for
 * surfacing generation status in media galleries.
 */
import type { GenerationResponse } from '../api/generations';
import { isGenerationActive, isGenerationTerminal, type GenerationStatus } from '@features/generation';
import { getStatusConfig, getStatusTextColor } from './generationStatusConfig';

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
  const config = getStatusConfig(status);
  return {
    label: config.label,
    icon: config.icon,
    color: getStatusTextColor(status),
    description: config.description,
  };
}

// Re-export for backwards compatibility
// Prefer importing directly from '@features/generation'
export { isGenerationTerminal as isGenerationStatusTerminal } from '@features/generation';
