import { apiClient } from './client';
import { devValidateParams, devLogParams } from '../validation/devValidation';
import { createGeneration, type CreateGenerationRequest } from './generations';

export interface GenerateAssetRequest {
  prompt: string;
  providerId?: string;
  presetId?: string;
  operationType?: 'text_to_video' | 'image_to_video' | 'video_extend' | 'video_transition' | 'fusion';
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
 * Trigger quick generation of an asset via the control center.
 *
 * LEGACY WRAPPER: This function wraps the new unified generations API
 * to maintain backward compatibility with existing components.
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

  // Map operation type to generation type
  const generationType = req.operationType === 'video_transition' ? 'transition' : 'variation';

  // Build minimal generation config for legacy API
  const config = {
    generation_type: generationType,
    purpose: 'gap_fill' as const,
    style: {
      pacing: 'medium' as const,
    },
    duration: {
      target: 10,
    },
    constraints: {
      rating: 'PG-13' as const,
    },
    strategy: 'once' as const,
    fallback: {
      mode: 'skip' as const,
    },
    enabled: true,
    version: 1,
  };

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
