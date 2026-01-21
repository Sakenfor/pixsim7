/**
 * Generation-Asset Mapping
 *
 * Maps generation IDs to asset IDs and provides helpers for
 * surfacing generation status in media galleries.
 *
 * Uses internal GenerationModel (camelCase) - API responses should be
 * mapped before calling these functions.
 */
import type { IconName } from '@lib/icons';

import { isGenerationActive, type GenerationModel } from '@features/generation';

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
  generations: GenerationModel[]
): GenerationStatusInfo | undefined {
  // Find the most recent generation for this asset
  const gen = generations
    .filter(g => (g.asset?.id ?? g.assetId) === assetId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  if (!gen) return undefined;

  return {
    generationId: gen.id,
    status: gen.status,
    providerId: gen.providerId,
    operationType: gen.operationType,
    errorMessage: gen.errorMessage,
    startedAt: gen.startedAt,
    completedAt: gen.completedAt,
    retryCount: gen.retryCount,
  };
}

/**
 * Get all assets that have active (non-terminal) generations
 */
export function getAssetsWithActiveGenerations(
  generations: GenerationModel[]
): Set<number> {
  const assetIds = new Set<number>();

  for (const gen of generations) {
    const assetId = gen.asset?.id ?? gen.assetId;
    if (assetId && isGenerationActive(gen.status)) {
      assetIds.add(assetId);
    }
  }

  return assetIds;
}

/**
 * Get all assets that have failed generations
 */
export function getAssetsWithFailedGenerations(
  generations: GenerationModel[]
): Set<number> {
  const assetIds = new Set<number>();

  for (const gen of generations) {
    const assetId = gen.asset?.id ?? gen.assetId;
    if (assetId && gen.status === 'failed') {
      assetIds.add(assetId);
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
  icon: IconName;
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
