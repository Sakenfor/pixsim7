import { createGeneration, type CreateGenerationRequest, type GenerationNodeConfigSchema } from '@lib/api/generations';
import { devValidateParams, devLogParams } from '@lib/utils/validation/devValidation';

import type { OperationType } from '@/types/operations';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
  operationType?: OperationType;
  extraParams?: Record<string, any>;
  presetParams?: Record<string, any>;
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
function mapOperationToGenerationType(
  operationType?: string
): 'video_transition' | 'text_to_video' | 'variation' | 'dialogue' | 'environment' | 'image_to_video' | 'image_to_image' | 'fusion' | 'text_to_image' | 'video_extend' {
  switch (operationType) {
    case 'text_to_image':
      return 'text_to_image';
    case 'text_to_video':
      return 'text_to_video';
    case 'video_transition':
      return 'video_transition';  // Canonical (was 'transition')
    case 'image_to_video':
      return 'image_to_video';
    case 'image_to_image':
      return 'image_to_image';  // Canonical (was 'image_edit')
    case 'video_extend':
      return 'video_extend';
    case 'dialogue':
      return 'dialogue';  // Semantic alias (game-dialogue plugin)
    case 'environment':
      return 'environment';  // Semantic alias (game-dialogue plugin)
    case 'fusion':
      return 'fusion';
    default:
      return 'text_to_video';  // Default to canonical alias for unknown operations
  }
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
]);

function buildGenerationConfig(
  generationType:
    | 'video_transition'
    | 'text_to_video'
    | 'image_to_video'
    | 'variation'
    | 'dialogue'
    | 'environment'
    | 'npc_response'
    | 'image_to_image'
    | 'fusion'
    | 'text_to_image'
    | 'video_extend',
  params: Record<string, any>,
  providerId: string = 'pixverse'
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
    providerSettings[key] = value;
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
  };

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
  // extraParams from buildGenerationRequest already includes presetParams merged in,
  // so we just add prompt and preset_id for the final merged params
  const { preferred_account_id, ...restExtra } = (req.extraParams || {}) as Record<string, any>;

  const mergedParams = {
    prompt: req.prompt,
    preset_id: req.presetId,
    ...restExtra,
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
  // Note: extraParams already contains presetParams from buildGenerationRequest,
  // so we pass empty object for presetParams to avoid double-merging
  const config = buildGenerationConfig(
    generationType,
    { prompt: req.prompt, ...restExtra },
    providerId
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
