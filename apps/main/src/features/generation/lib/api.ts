import { createGeneration, type CreateGenerationRequest, type GenerationNodeConfigSchema } from '@lib/api/generations';
import { devValidateParams, devLogParams } from '@lib/utils/validation/devValidation';

import type { OperationType } from '@/types/operations';

import type { GenerationRunContext } from './runContext';
import { nextRandomGenerationSeed } from './seed';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  operationType?: OperationType;
  extraParams?: Record<string, any>;
  runContext?: GenerationRunContext;
}

export interface GenerateAssetResponse {
  job_id: number;
  status: 'queued' | 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  raw?: any; // backend GenerationResponse for advanced callers
}

/**
 * Map Control Center operation type to unified generation_type.
 * The backend maps these back to OperationType in api/v1/generations.py.
 */
/**
 * Map Control Center operation type to unified generation_type.
 *
 * Uses canonical aliases (matching OperationType enum names) where possible.
 * The backend maps these to OperationType in api/v1/generations.py.
 */
function mapOperationToGenerationType(operationType?: OperationType): OperationType {
  return operationType || 'text_to_video';
}

/**
 * Build a GenerationNodeConfig-compatible object from Control Center settings.
 *
 * Provider-specific settings convention:
 * - Provider settings (model, quality, off_peak, audio, multi_shot) are placed
 *   in style.<providerId> = { model, quality, off_peak, audio, multi_shot }
 * - This keeps the config schema-compliant while allowing provider extensions.
 * - The backend's _canonicalize_params extracts these to top-level canonical fields.
 */
const CANONICAL_CONFIG_KEYS = new Set([
  'prompt',
  'duration',
  'rating',
  'image_url',
  'image_urls',
  'video_url',
  'original_video_id',
  'source_asset_id',
  'source_asset_ids',
  'sourceAssetId',
  'sourceAssetIds',
  'prompts',
  'composition_assets',
  'pacing',
  'mask_url',
  'mask_source',
  // These should NOT go into style.pixverse - they're handled at the top level
  'operation_type',
  'operationType',
]);

function buildGenerationConfig(
  generationType: OperationType,
  params: Record<string, any>,
  providerId: string = 'pixverse',
  runContext?: GenerationRunContext,
): GenerationNodeConfigSchema {
  const merged = { ...params };

  // Extract duration settings (only if explicitly provided)
  const durationTarget = merged.duration;

  // Extract rating constraint (optional)
  const rating = merged.rating;

  // Build provider-specific settings (placed in style.<providerId>)
  // The backend will extract these for the provider adapter
  const providerSettings: Record<string, any> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue;
    if (CANONICAL_CONFIG_KEYS.has(key)) continue;
    // Skip blank seed values — a random seed is injected below.
    if (
      key === 'seed'
      && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
    ) {
      continue;
    }
    providerSettings[key] = value;
  }

  // Always send a random seed when the user hasn't pinned one.
  // This ensures each generation gets unique randomness (0–2 147 483 647).
  if (providerSettings.seed === undefined) {
    providerSettings.seed = nextRandomGenerationSeed();
  }

  // Build style block (generation-level + provider-specific)
  const style: Record<string, any> = {};
  if (merged.pacing !== undefined) {
    style.pacing = merged.pacing;
  }
  if (Object.keys(providerSettings).length > 0) {
    style[providerId] = providerSettings;
  }

  // Build duration constraints object (schema requires the field, but values are optional)
  const duration: Record<string, any> = {};
  if (durationTarget !== undefined) {
    duration.target = durationTarget;
  }

  // Build constraints block
  const constraints: Record<string, any> = {};
  if (rating !== undefined) {
    constraints.rating = rating;
  }

  // Build the config object (matches GenerationNodeConfigSchema)
  const sourceAssetId =
    merged.sourceAssetId ?? merged.source_asset_id ?? merged.original_video_id;
  const sourceAssetIds = merged.sourceAssetIds ?? merged.source_asset_ids;

  const config: GenerationNodeConfigSchema = {
    generationType,
    purpose: 'gap_fill',
    style,
    duration,
    constraints,
    strategy: 'once',
    fallback: {
      mode: 'skip',
    },
    enabled: true,
    version: 1,
    ...(merged.prompt ? { prompt: merged.prompt } : {}),
    ...(merged.image_url ? { image_url: merged.image_url } : {}),
    ...(merged.video_url ? { video_url: merged.video_url } : {}),
    ...(merged.image_urls ? { image_urls: merged.image_urls } : {}),
    ...(merged.prompts ? { prompts: merged.prompts } : {}),
    ...(sourceAssetId !== undefined ? { sourceAssetId } : {}),
    ...(sourceAssetIds ? { sourceAssetIds } : {}),
    ...(merged.composition_assets ? { composition_assets: merged.composition_assets } : {}),
    ...(merged.mask_url ? { mask_url: merged.mask_url } : {}),
  };

  if (runContext && typeof runContext === 'object') {
    // GenerationNodeConfigSchema accepts extra keys; this is consumed by backend
    // tracking/manifests and ignored by provider param mapping.
    (config as Record<string, any>).run_context = runContext;
  }

  return config;
}

/**
 * Trigger quick generation of an asset via the control center.
 *
 * This function builds a proper GenerationNodeConfig from Control Center
 * settings and sends it through the unified generations API.
 *
 * Returns a job ID that can be tracked via polling.
 */
export async function generateAsset(req: GenerateAssetRequest): Promise<GenerateAssetResponse> {
  const restExtra = { ...((req.extraParams || {}) as Record<string, any>) };
  const preferred_account_id = restExtra.preferred_account_id;
  delete restExtra.preferred_account_id;
  // Prevent stale param state from overriding the canonical prompt argument.
  delete restExtra.prompt;

  const mergedParams = {
    ...restExtra,
    prompt: req.prompt,
  };

  // Optional dev validation (warnings only, doesn't block)
  devValidateParams(
    { kind: req.operationType || 'text_to_video', ...mergedParams },
    'generateAsset'
  );
  devLogParams(mergedParams, `generateAsset(${req.operationType})`);

  // Map control center operation type to unified generation_type
  const generationType = mapOperationToGenerationType(req.operationType);
  const providerId = req.providerId || 'pixverse';

  // Build proper GenerationNodeConfig from Control Center settings
  const config = buildGenerationConfig(
    generationType,
    mergedParams,
    providerId,
    req.runContext,
  );

  // Create generation request
  // Use force_new to bypass deduplication (avoids getting stuck on pending generations)
  const generationRequest: CreateGenerationRequest & { preferred_account_id?: number } = {
    config,
    provider_id: providerId,
    name: `Quick generation: ${req.prompt.slice(0, 50)}`,
    priority: 5,
    version_intent: 'new',
    force_new: true,
    ...(preferred_account_id ? { preferred_account_id } : {}),
  };

  // Call new unified generations API
  const generation = await createGeneration(generationRequest);

  // Return in legacy format
  return {
    job_id: generation.id,
    status: generation.status as GenerateAssetResponse['status'],
    raw: generation,
  };
}
