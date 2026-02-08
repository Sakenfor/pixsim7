/**
 * Pure data-parsing utilities for generation record handling.
 * Split from mediaCardGeneration.tsx — no React dependencies.
 */
import type { InputItem } from '@features/generation';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';


export const EMPTY_INPUTS: InputItem[] = [];

export const INPUT_PARAM_KEYS = new Set([
  'prompt',
  'prompts',
  'negative_prompt',
  'negativePrompt',
  'image_url',
  'image_urls',
  'imageUrl',
  'imageUrls',
  'video_url',
  'videoUrl',
  'original_video_id',
  'originalVideoId',
  'source_asset_id',
  'source_asset_ids',
  'sourceAssetId',
  'sourceAssetIds',
  'composition_assets',
  'compositionAssets',
  'operation_type',
  'operationType',
]);

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseAssetRefId(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() !== '') {
    const trimmed = value.trim();
    const match = /^asset[:_](\d+)$/.exec(trimmed);
    if (match) {
      return toNumber(match[1]);
    }
  }
  if (value && typeof value === 'object') {
    return toNumber((value as any).id);
  }
  return null;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toNumber(entry))
    .filter((entry): entry is number => entry !== null);
}

export function stripInputParams(params: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (!INPUT_PARAM_KEYS.has(key)) {
      filtered[key] = value;
    }
  });
  return filtered;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return '';
}

function extractGenerationPrompt(
  generation: Record<string, unknown>,
  params: Record<string, unknown>,
): string {
  const promptConfig = (generation as any).prompt_config ?? (generation as any).promptConfig ?? {};
  const generationConfig =
    (params as any).generation_config ??
    (params as any).generationConfig ??
    {};

  return pickString(
    (generation as any).final_prompt,
    (generation as any).finalPrompt,
    (generation as any).prompt,
    (promptConfig as any).inlinePrompt,
    (generationConfig as any).prompt,
    (params as any).prompt,
  );
}

/**
 * Parse a generation record into normalized fields.
 * Used by both regenerate and extend handlers.
 */
export function parseGenerationRecord(
  genRecord: Record<string, unknown>,
  fallbackOperationType: OperationType,
): {
  params: Record<string, unknown>;
  operationType: OperationType;
  providerId: string;
  prompt: string;
} {
  const params =
    (genRecord as any).params ??
    (genRecord as any).canonical_params ??
    (genRecord as any).raw_params ??
    (genRecord as any).canonicalParams ??
    (genRecord as any).rawParams ??
    {};

  const candidateOperation =
    (genRecord as any).operation_type ??
    (genRecord as any).operationType ??
    (genRecord as any).generation_type ??
    (genRecord as any).generationType;
  const operationType =
    candidateOperation && candidateOperation in OPERATION_METADATA
      ? (candidateOperation as OperationType)
      : fallbackOperationType;

  const providerId =
    (genRecord as any).provider_id ??
    (genRecord as any).providerId ??
    'pixverse';

  const prompt = extractGenerationPrompt(genRecord, params as Record<string, unknown>);

  return { params, operationType, providerId, prompt };
}

export function extractGenerationAssetIds(
  generation: Record<string, unknown>,
  params: Record<string, unknown>,
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const push = (id: number | null) => {
    if (id === null || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  [
    ...toNumberArray((generation as any).source_asset_ids),
    ...toNumberArray((generation as any).sourceAssetIds),
  ].forEach((id) => push(id));

  const directId =
    toNumber((generation as any).source_asset_id) ??
    toNumber((generation as any).sourceAssetId) ??
    null;
  push(directId);

  [
    ...toNumberArray((params as any).source_asset_ids),
    ...toNumberArray((params as any).sourceAssetIds),
  ].forEach((id) => push(id));

  const paramSourceId =
    toNumber((params as any).source_asset_id) ??
    toNumber((params as any).sourceAssetId) ??
    toNumber((params as any).original_video_id) ??
    toNumber((params as any).originalVideoId) ??
    null;
  push(paramSourceId);

  const compositionAssets =
    (params as any).composition_assets ??
    (params as any).compositionAssets;
  if (Array.isArray(compositionAssets)) {
    compositionAssets.forEach((entry) => {
      if (typeof entry === 'number' || typeof entry === 'string') {
        push(toNumber(entry));
        return;
      }
      if (entry && typeof entry === 'object') {
        const assetId =
          toNumber((entry as any).asset_id) ??
          toNumber((entry as any).assetId) ??
          parseAssetRefId((entry as any).asset) ??
          toNumber((entry as any).id) ??
          null;
        push(assetId);
      }
    });
  }

  const inputs = (generation as any).inputs;
  if (Array.isArray(inputs)) {
    inputs.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const assetId =
        toNumber((entry as any).asset_id) ??
        toNumber((entry as any).assetId) ??
        toNumber((entry as any).id) ??
        toNumber((entry as any).asset?.id) ??
        null;
      push(assetId);
    });
  }

  return ids;
}
