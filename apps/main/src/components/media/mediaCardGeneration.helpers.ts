/**
 * Pure utility functions for media card generation logic.
 * No React dependencies — safe to import from hooks or non-React modules.
 */

import { providerCapabilityRegistry } from '@features/providers';

import type { OperationType } from '@/types/operations';

export function stripSeedFromValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSeedFromValue(entry));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (key === 'seed') {
        return;
      }
      next[key] = stripSeedFromValue(entry);
    });
    return next;
  }
  return value;
}

export function stripSeedFromParams(params: Record<string, unknown>): Record<string, unknown> {
  const stripped = stripSeedFromValue(params);
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped)) {
    return {};
  }
  return stripped as Record<string, unknown>;
}

export function paramsIncludeSeed(params: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(params, 'seed');
}

export async function operationSupportsSeedParam(
  providerId: string | undefined,
  operationType: OperationType,
): Promise<boolean> {
  if (!providerId) return false;

  try {
    await providerCapabilityRegistry.fetchCapabilities();
  } catch {
    // Best effort. If fetch fails, fall back to whatever is currently cached.
  }

  const spec = providerCapabilityRegistry.getOperationSpec(providerId, operationType);
  const parameters = Array.isArray((spec as { parameters?: Array<{ name?: string }> } | null)?.parameters)
    ? (spec as { parameters?: Array<{ name?: string }> }).parameters!
    : [];

  return parameters.some((param) => param?.name === 'seed');
}

export type PromptLimitOpSpec = {
  parameters?: Array<{
    name?: string;
    max?: number;
    max_length?: number;
    metadata?: {
      per_model_max_length?: Record<string, number>;
    };
  }>;
};

export function resolvePromptLimitFromSpec(
  providerId: string | undefined,
  model: string | undefined,
  opSpec: PromptLimitOpSpec | undefined,
): number | undefined {
  const promptSpec = Array.isArray(opSpec?.parameters)
    ? opSpec.parameters.find((param) => param?.name === 'prompt')
    : undefined;

  if (model && promptSpec?.metadata?.per_model_max_length) {
    const modelLower = model.toLowerCase();
    for (const [key, limit] of Object.entries(promptSpec.metadata.per_model_max_length)) {
      if (key.toLowerCase() === modelLower || modelLower.startsWith(key.toLowerCase())) {
        return limit;
      }
    }
  }

  if (typeof promptSpec?.max_length === 'number') return promptSpec.max_length;
  if (typeof promptSpec?.max === 'number') return promptSpec.max;
  if (providerId) return providerCapabilityRegistry.getPromptLimit(providerId) ?? undefined;
  return undefined;
}

export function hasAssetInputs(params: Record<string, unknown>): boolean {
  const asRecord = params as Record<string, unknown>;

  const compositionAssets = asRecord.composition_assets ?? asRecord.compositionAssets;
  if (Array.isArray(compositionAssets) && compositionAssets.length > 0) {
    return true;
  }

  const sourceAssetIds = asRecord.source_asset_ids ?? asRecord.sourceAssetIds;
  if (Array.isArray(sourceAssetIds) && sourceAssetIds.length > 0) {
    return true;
  }

  const imageUrls = asRecord.image_urls ?? asRecord.imageUrls;
  if (Array.isArray(imageUrls) && imageUrls.length > 0) {
    return true;
  }

  const singleInputCandidates = [
    asRecord.source_asset_id,
    asRecord.sourceAssetId,
    asRecord.image_url,
    asRecord.imageUrl,
    asRecord.video_url,
    asRecord.videoUrl,
    asRecord.original_video_id,
    asRecord.originalVideoId,
  ];

  return singleInputCandidates.some((value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.trim() !== '';
    return false;
  });
}
