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

export interface TextToImageParams extends QualityParams, AspectParams {
  kind: 'text_to_image';
  prompt: string;
  negative_prompt?: string;
  seed?: number;
}

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

export interface ImageToImageParams extends QualityParams, AspectParams {
  kind: 'image_to_image';
  prompt: string;
  image_url: string;
  negative_prompt?: string;
  strength?: number;          // How much to change the image (0-1)
  seed?: number;
  parent_generation_id?: number;  // Link to base image for variation tracking
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
  | TextToImageParams
  | TextToVideoParams
  | ImageToVideoParams
  | ImageToImageParams
  | VideoExtendParams
  | VideoTransitionParams
  | FusionParams;

// ─────────────────────────────────────────────────────────────────────────────
// Operation Type Constants
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATION_TYPES = [
  'text_to_image',
  'text_to_video',
  'image_to_video',
  'image_to_image',
  'video_extend',
  'video_transition',
  'fusion',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Operation Metadata Registry
// ─────────────────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video';

export type MultiAssetMode = 'single' | 'optional' | 'required';

export interface OperationMetadata {
  /** Display label */
  label: string;
  /** Short description */
  description: string;
  /** Multi-asset behavior */
  multiAssetMode: MultiAssetMode;
  /** What media types can be used as input (empty = no media input, e.g., text_to_*) */
  acceptsInput: MediaType[];
  /** Output media type */
  outputType: MediaType;
  /** Whether prompt is required */
  promptRequired: boolean;
  /** Whether prompt is supported (optional) */
  promptSupported: boolean;
}

/**
 * Centralized metadata for all operation types.
 * Use this instead of scattered if/elif checks throughout the codebase.
 */
export const OPERATION_METADATA: Record<OperationType, OperationMetadata> = {
  text_to_image: {
    label: 'Text to Image',
    description: 'Generate an image from a text prompt',
    multiAssetMode: 'single',
    acceptsInput: [],
    outputType: 'image',
    promptRequired: true,
    promptSupported: true,
  },
  text_to_video: {
    label: 'Text to Video',
    description: 'Generate a video from a text prompt',
    multiAssetMode: 'single',
    acceptsInput: [],
    outputType: 'video',
    promptRequired: true,
    promptSupported: true,
  },
  image_to_video: {
    label: 'Image to Video',
    description: 'Animate an image into a video',
    multiAssetMode: 'single',
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
  },
  image_to_image: {
    label: 'Image Generation',
    description: 'Transform or edit an image',
    multiAssetMode: 'optional', // Can use multiple source images for composition/style
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'image',
    promptRequired: true,
    promptSupported: true,
  },
  video_extend: {
    label: 'Video Extend',
    description: 'Extend a video with additional frames',
    multiAssetMode: 'single',
    acceptsInput: ['video'],
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
  },
  video_transition: {
    label: 'Video Transition',
    description: 'Create transitions between multiple images',
    multiAssetMode: 'required',
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'video',
    promptRequired: true,
    promptSupported: true,
  },
  fusion: {
    label: 'Fusion',
    description: 'Blend multiple assets together',
    multiAssetMode: 'optional',
    acceptsInput: ['image', 'video'],
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
  },
};

/**
 * Check if an operation supports multiple input assets
 */
export function isMultiAssetOperation(operationType: OperationType): boolean {
  const mode = OPERATION_METADATA[operationType]?.multiAssetMode;
  return mode === 'optional' || mode === 'required';
}

/**
 * Check if an operation should default to the multi-asset queue.
 *
 * @deprecated Use `useGenerationQueueStore().resolveQueueType()` instead for
 * centralized queue routing that respects user preferences for optional operations.
 */
export function shouldDefaultToMultiAssetQueue(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.multiAssetMode === 'required';
}

/**
 * Check if an operation accepts a given media type as input
 */
export function operationAcceptsMediaType(operationType: OperationType, mediaType: MediaType): boolean {
  return OPERATION_METADATA[operationType]?.acceptsInput.includes(mediaType) ?? false;
}

/**
 * Get all operations that accept a given media type
 */
export function getOperationsForMediaType(mediaType: MediaType): OperationType[] {
  return OPERATION_TYPES.filter(op => operationAcceptsMediaType(op, mediaType));
}

/**
 * Get the default single-asset operation for a media type
 */
export function getDefaultOperation(mediaType: MediaType): OperationType {
  return mediaType === 'image' ? 'image_to_video' : 'video_extend';
}

/**
 * Check if a string is a valid OperationType
 */
export function isValidOperationType(value: string): value is OperationType {
  return OPERATION_TYPES.includes(value as OperationType);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

export function isTextToImage(params: unknown): params is TextToImageParams {
  return (params as OperationParams)?.kind === 'text_to_image';
}

export function isTextToVideo(params: unknown): params is TextToVideoParams {
  return (params as OperationParams)?.kind === 'text_to_video';
}

export function isImageToVideo(params: unknown): params is ImageToVideoParams {
  return (params as OperationParams)?.kind === 'image_to_video';
}

export function isImageToImage(params: unknown): params is ImageToImageParams {
  return (params as OperationParams)?.kind === 'image_to_image';
}

export function isVideoExtend(params: unknown): params is VideoExtendParams {
  return (params as OperationParams)?.kind === 'video_extend';
}

export function isVideoTransition(params: unknown): params is VideoTransitionParams {
  return (params as OperationParams)?.kind === 'video_transition';
}

export function isFusion(params: unknown): params is FusionParams {
  return (params as OperationParams)?.kind === 'fusion';
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
export function operationRequiresPrompt(operationType: OperationType): boolean {
  return operationType === 'text_to_image' || operationType === 'text_to_video' || operationType === 'image_to_image';
}

/**
 * Check if operation supports optional prompt
 */
export function operationSupportsPrompt(operationType: OperationType): boolean {
  const supportsPrompt: OperationType[] = ['text_to_image', 'text_to_video', 'image_to_video', 'image_to_image', 'video_extend', 'fusion'];
  return supportsPrompt.includes(operationType);
}

/**
 * Check if operation requires an image input
 */
export function operationRequiresImage(operationType: OperationType): boolean {
  return operationType === 'image_to_video' || operationType === 'image_to_image';
}

/**
 * Check if operation requires a video input
 */
export function operationRequiresVideo(operationType: OperationType): boolean {
  return operationType === 'video_extend';
}

/**
 * Validate operation parameters and return list of error messages.
 * Used for optional dev-time validation.
 */
export function validateOperationParams(params: Partial<OperationParams>): string[] {
  const errors: string[] = [];

  if (!params.kind) {
    errors.push('Operation kind is required');
    return errors;
  }

  switch (params.kind) {
    case 'text_to_image':
      if (!params.prompt || typeof params.prompt !== 'string') {
        errors.push('text_to_image requires a prompt (string)');
      }
      break;

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

    case 'image_to_image':
      if (!params.prompt || typeof params.prompt !== 'string') {
        errors.push('image_to_image requires a prompt (string)');
      }
      if (!params.image_url || typeof params.image_url !== 'string') {
        errors.push('image_to_image requires image_url (string)');
      }
      if (params.strength !== undefined && (typeof params.strength !== 'number' || params.strength < 0 || params.strength > 1)) {
        errors.push('image_to_image strength must be a number between 0 and 1');
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
