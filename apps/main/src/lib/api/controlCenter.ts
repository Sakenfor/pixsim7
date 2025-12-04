import { apiClient } from './client';
import { devValidateParams, devLogParams } from '../validation/devValidation';
import { createGeneration, type CreateGenerationRequest } from './generations';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
  operationType?: 'text_to_video' | 'image_to_video' | 'image_to_image' | 'video_extend' | 'video_transition' | 'fusion';
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
): 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response' {
  switch (operationType) {
    case 'video_transition':
      return 'transition';
    case 'image_to_video':
    case 'image_to_image':
      return 'npc_response';
    case 'dialogue':
      return 'dialogue';
    case 'environment':
      return 'environment';
    default:
      return 'variation';
  }
}

/**
 * Build a GenerationNodeConfig-compatible object from Control Center settings.
 *
 * Provider-specific settings convention:
 * - Pixverse settings (model, quality, off_peak, audio, multi_shot) are placed
 *   in style.pixverse = { model, quality, off_peak, audio, multi_shot }
 * - This keeps the config schema-compliant while allowing provider extensions.
 * - The backend's _canonicalize_params extracts these to top-level canonical fields.
 */
function buildGenerationConfig(
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response',
  presetParams: Record<string, any>,
  extraParams: Record<string, any>
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

  // Build Pixverse-specific settings (placed in style.pixverse)
  // The backend will extract these for the provider adapter
  const pixverseSettings: Record<string, any> = {};
  if (merged.model !== undefined) pixverseSettings.model = merged.model;
  if (merged.quality !== undefined) pixverseSettings.quality = merged.quality;
  if (merged.off_peak !== undefined) pixverseSettings.off_peak = merged.off_peak;
  if (merged.audio !== undefined) pixverseSettings.audio = merged.audio;
  if (merged.multi_shot !== undefined) pixverseSettings.multi_shot = merged.multi_shot;
  if (merged.aspect_ratio !== undefined) pixverseSettings.aspect_ratio = merged.aspect_ratio;
  if (merged.seed !== undefined) pixverseSettings.seed = merged.seed;
  if (merged.camera_movement !== undefined) pixverseSettings.camera_movement = merged.camera_movement;
  if (merged.negative_prompt !== undefined) pixverseSettings.negative_prompt = merged.negative_prompt;

  // Build the config object (matches GenerationNodeConfigSchema)
  const config: Record<string, any> = {
    generation_type: generationType,
    purpose: 'gap_fill',
    style: {
      pacing,
      // Provider-specific settings nested under provider key
      // This is the convention: style.<provider_id> = { provider-specific fields }
      ...(Object.keys(pixverseSettings).length > 0 ? { pixverse: pixverseSettings } : {}),
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

  // Include video_url for video_extend operations
  if (merged.video_url) {
    config.video_url = merged.video_url;
  }

  // Include transition-specific fields
  if (merged.image_urls) {
    config.image_urls = merged.image_urls;
  }
  if (merged.prompts) {
    config.prompts = merged.prompts;
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
  // Build params - merge preset and extra params
  const params = {
    prompt: req.prompt,
    preset_id: req.presetId,
    ...(req.presetParams || {}),
    ...(req.extraParams || {}),
  };

  // Optional dev validation (warnings only, doesn't block)
  devValidateParams(
    { kind: req.operationType || 'text_to_video', ...params },
    'generateAsset'
  );
  devLogParams(params, `generateAsset(${req.operationType})`);

  // Map control center operation type to unified generation_type
  const generationType = mapOperationToGenerationType(req.operationType);

  // Build proper GenerationNodeConfig from Control Center settings
  const config = buildGenerationConfig(
    generationType,
    req.presetParams || {},
    { prompt: req.prompt, ...(req.extraParams || {}) }
  );

  // Create generation request
  const generationRequest: CreateGenerationRequest = {
    config,
    provider_id: req.providerId || 'pixverse',
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
