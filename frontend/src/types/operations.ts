/**
 * Operation parameter types with discriminated unions.
 * These types provide better type safety and editor autocomplete for operation-specific parameters.
 *
 * NOTE: These types are NOT strictly enforced yet. The actual API accepts Record<string, any>.
 * Use these for documentation and optional dev-time validation only.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Common Parameter Types
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityParams {
  quality?: string;
}

export interface AspectParams {
  aspect_ratio?: string;
}

export interface MotionParams {
  motion_mode?: string;
}

export interface DurationParams {
  duration?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation-Specific Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TextToVideoParams extends QualityParams, AspectParams, MotionParams, DurationParams {
  kind: 'text_to_video';
  prompt: string;
  negative_prompt?: string;
  seed?: number;
}

export interface ImageToVideoParams extends QualityParams, AspectParams, MotionParams, DurationParams {
  kind: 'image_to_video';
  prompt?: string;
  image_url: string;
  negative_prompt?: string;
  seed?: number;
}

export interface VideoExtendParams extends QualityParams, DurationParams {
  kind: 'video_extend';
  prompt?: string;
  video_url?: string;
  original_video_id?: string;
  seed?: number;
}

export interface VideoTransitionParams extends QualityParams, AspectParams, DurationParams {
  kind: 'video_transition';
  image_urls: string[];
  prompts: string[];
  transition_style?: string;
}

export interface FusionParams extends QualityParams, DurationParams {
  kind: 'fusion';
  fusion_assets: string[];
  prompt?: string;
  blend_mode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discriminated Union
// ─────────────────────────────────────────────────────────────────────────────

export type OperationParams =
  | TextToVideoParams
  | ImageToVideoParams
  | VideoExtendParams
  | VideoTransitionParams
  | FusionParams;

// ─────────────────────────────────────────────────────────────────────────────
// Operation Type Constants
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATION_TYPES = [
  'text_to_video',
  'image_to_video',
  'video_extend',
  'video_transition',
  'fusion',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isTextToVideo(params: unknown): params is TextToVideoParams {
  return (params as any)?.kind === 'text_to_video' || (params as any)?.prompt !== undefined;
}

export function isImageToVideo(params: unknown): params is ImageToVideoParams {
  return (params as any)?.kind === 'image_to_video' || (params as any)?.image_url !== undefined;
}

export function isVideoExtend(params: unknown): params is VideoExtendParams {
  return (
    (params as any)?.kind === 'video_extend' ||
    (params as any)?.video_url !== undefined ||
    (params as any)?.original_video_id !== undefined
  );
}

export function isVideoTransition(params: unknown): params is VideoTransitionParams {
  return (params as any)?.kind === 'video_transition' || (params as any)?.image_urls !== undefined;
}

export function isFusion(params: unknown): params is FusionParams {
  return (params as any)?.kind === 'fusion' || (params as any)?.fusion_assets !== undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get active preset parameter keys (for memoization checks)
 */
export function getActivePresetParamKeys(presetParams: Record<string, any>): string[] {
  return Object.keys(presetParams);
}

/**
 * Check if operation requires a prompt
 */
export function operationRequiresPrompt(operationType: string): boolean {
  return operationType === 'text_to_video';
}

/**
 * Check if operation supports optional prompt
 */
export function operationSupportsPrompt(operationType: string): boolean {
  return ['text_to_video', 'image_to_video', 'video_extend', 'fusion'].includes(operationType);
}

/**
 * Validate operation parameters and return list of error messages.
 * Used for optional dev-time validation.
 */
export function validateOperationParams(params: Partial<Record<string, any>>): string[] {
  const errors: string[] = [];

  if (!params.kind) {
    errors.push('Operation kind is required');
    return errors;
  }

  switch (params.kind) {
    case 'text_to_video':
      if (!params.prompt || typeof params.prompt !== 'string') {
        errors.push('text_to_video requires a prompt (string)');
      }
      break;

    case 'image_to_video':
      if (!params.image_url || typeof params.image_url !== 'string') {
        errors.push('image_to_video requires image_url (string)');
      }
      break;

    case 'video_extend':
      if (!params.video_url && !params.original_video_id) {
        errors.push('video_extend requires either video_url or original_video_id');
      }
      break;

    case 'video_transition':
      if (!Array.isArray(params.image_urls) || params.image_urls.length === 0) {
        errors.push('video_transition requires non-empty image_urls array');
      }
      if (!Array.isArray(params.prompts) || params.prompts.length === 0) {
        errors.push('video_transition requires non-empty prompts array');
      }
      if (
        Array.isArray(params.image_urls) &&
        Array.isArray(params.prompts) &&
        params.image_urls.length !== params.prompts.length
      ) {
        errors.push('video_transition: image_urls and prompts arrays must have equal length');
      }
      break;

    case 'fusion':
      if (!Array.isArray(params.fusion_assets) || params.fusion_assets.length === 0) {
        errors.push('fusion requires non-empty fusion_assets array');
      }
      break;
  }

  return errors;
}
