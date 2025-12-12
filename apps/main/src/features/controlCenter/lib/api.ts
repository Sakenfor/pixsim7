import { apiClient } from './client';
import { devValidateParams, devLogParams } from '../validation/devValidation';
import { createGeneration, type CreateGenerationRequest } from './generations';
import type { OperationType } from '../../types/operations';

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
function mapOperationToGenerationType(
  operationType?: string
): 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response' | 'image_edit' | 'fusion' | 'text_to_image' | 'video_extend' {
  switch (operationType) {
    case 'text_to_image':
      return 'text_to_image';
    case 'video_transition':
      return 'transition';
    case 'image_to_video':
      return 'npc_response';
    case 'image_to_image':
      return 'image_edit';
    case 'video_extend':
      return 'video_extend';
    case 'dialogue':
      return 'dialogue';
    case 'environment':
      return 'environment';
    case 'fusion':
      return 'fusion';
    default:
      return 'variation';
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
  'prompts',
  'fusion_assets',
  'pacing',
]);

function buildGenerationConfig(
  generationType:
    | 'transition'
    | 'variation'
    | 'dialogue'
    | 'environment'
    | 'npc_response'
    | 'image_edit'
    | 'fusion'
    | 'text_to_image'
    | 'video_extend',
  params: Record<string, any>,
  providerId: string = 'pixverse'
): Record<string, any> {
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
  const config: Record<string, any> = {
    generation_type: generationType,
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
  };

  // Include prompt in config for structured params (backend expects this for logging/introspection)
  if (merged.prompt) {
    config.prompt = merged.prompt;
  }

  // Include image_url for image_to_video operations
  if (merged.image_url) {
    config.image_url = merged.image_url;
  }

  // Include video_url and original_video_id for video_extend operations
  if (merged.video_url) {
    config.video_url = merged.video_url;
  }
  if (merged.original_video_id) {
    config.original_video_id = merged.original_video_id;
  }

  // Include transition-specific fields
  if (merged.image_urls) {
    config.image_urls = merged.image_urls;
  }
  if (merged.prompts) {
    config.prompts = merged.prompts;
  }

  // Include fusion-specific fields
  if (merged.fusion_assets) {
    config.fusion_assets = merged.fusion_assets;
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
  // extraParams from buildGenerationRequest already includes presetParams merged in,
  // so we just add prompt and preset_id for the final merged params
  const mergedParams = {
    prompt: req.prompt,
    preset_id: req.presetId,
    ...(req.extraParams || {}),
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
    { prompt: req.prompt, ...(req.extraParams || {}) },
    providerId
  );

  // Ensure prompt is always embedded in the config (some callers may omit it
  // from extraParams when presets/dynamic params change).
  if (req.prompt && req.prompt.trim().length > 0) {
    config.prompt = req.prompt.trim();
  }

  // Create generation request
  // Use force_new to bypass deduplication (avoids getting stuck on pending generations)
  const generationRequest: CreateGenerationRequest = {
    config,
    provider_id: providerId,
    name: `Quick generation: ${req.prompt.slice(0, 50)}`,
    force_new: true,
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
