import { apiClient } from './client';
import { devValidateParams, devLogParams } from '../validation/devValidation';
import { createGeneration, type CreateGenerationRequest } from './generations';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
  operationType?: 'text_to_image' | 'text_to_video' | 'image_to_video' | 'image_to_image' | 'video_extend' | 'video_transition' | 'fusion';
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
function buildGenerationConfig(
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response' | 'image_edit' | 'fusion' | 'text_to_image' | 'video_extend',
  presetParams: Record<string, any>,
  extraParams: Record<string, any>,
  providerId: string = 'pixverse'
): Record<string, any> {
  // Merge params (extra overrides preset)
  const merged = { ...presetParams, ...extraParams };

  // Extract duration settings
  const durationTarget = merged.duration ?? 5; // Default 5 seconds

  // Extract pacing from style hints
  const pacing = merged.motion_mode === 'dynamic' ? 'fast'
    : merged.motion_mode === 'steady' ? 'slow'
    : 'medium';

  // Extract rating constraint
  const rating = merged.rating ?? 'PG-13';

  // Build provider-specific settings (placed in style.<providerId>)
  // The backend will extract these for the provider adapter
  const providerSettings: Record<string, any> = {};
  if (merged.model !== undefined) providerSettings.model = merged.model;
  if (merged.quality !== undefined) providerSettings.quality = merged.quality;
  if (merged.off_peak !== undefined) providerSettings.off_peak = merged.off_peak;
  if (merged.audio !== undefined) providerSettings.audio = merged.audio;
  if (merged.multi_shot !== undefined) providerSettings.multi_shot = merged.multi_shot;
  if (merged.aspect_ratio !== undefined) providerSettings.aspect_ratio = merged.aspect_ratio;
  if (merged.seed !== undefined) providerSettings.seed = merged.seed;
  if (merged.camera_movement !== undefined) providerSettings.camera_movement = merged.camera_movement;
  if (merged.negative_prompt !== undefined) providerSettings.negative_prompt = merged.negative_prompt;
  // Additional provider fields that map_parameters expects
  if (merged.motion_mode !== undefined) providerSettings.motion_mode = merged.motion_mode;
  if (merged.style !== undefined) providerSettings.style = merged.style;
  if (merged.template_id !== undefined) providerSettings.template_id = merged.template_id;

  // Build the config object (matches GenerationNodeConfigSchema)
  const config: Record<string, any> = {
    generation_type: generationType,
    purpose: 'gap_fill',
    style: {
      pacing,
      // Provider-specific settings nested under provider key
      // This is the convention: style.<provider_id> = { provider-specific fields }
      ...(Object.keys(providerSettings).length > 0 ? { [providerId]: providerSettings } : {}),
    },
    duration: {
      target: durationTarget,
    },
    constraints: {
      rating,
    },
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
    {},  // presetParams already in extraParams
    { prompt: req.prompt, ...(req.extraParams || {}) },
    providerId
  );

  // Create generation request
  const generationRequest: CreateGenerationRequest = {
    config,
    provider_id: providerId,
    name: `Quick generation: ${req.prompt.slice(0, 50)}`,
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
