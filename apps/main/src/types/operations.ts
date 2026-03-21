/**
 * Operation parameter types with discriminated unions.
 * These types provide better type safety and editor autocomplete for operation-specific parameters.
 *
 * NOTE: These types are NOT strictly enforced yet. The actual API accepts Record<string, any>.
 * Use these for documentation and optional dev-time validation only.
 */

import type { CompositionAsset, MediaType } from '@pixsim7/shared.types';

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
  composition_assets: CompositionAsset[];
  negative_prompt?: string;
  seed?: number;
}

export interface ImageToImageParams extends QualityParams, AspectParams {
  kind: 'image_to_image';
  prompt: string;
  composition_assets: CompositionAsset[];
  negative_prompt?: string;
  strength?: number;          // How much to change the image (0-1)
  seed?: number;
  parent_generation_id?: number;  // Link to base image for variation tracking
}

export interface VideoExtendParams extends QualityParams, DurationParams {
  kind: 'video_extend';
  prompt?: string;
  composition_assets: CompositionAsset[];
  original_video_id?: string;
  seed?: number;
}

export interface VideoTransitionParams extends QualityParams, AspectParams, DurationParams {
  kind: 'video_transition';
  composition_assets: CompositionAsset[];
  prompts: string[];
  transition_style?: string;
}

export interface VideoModifyParams extends QualityParams, DurationParams {
  kind: 'video_modify';
  prompt: string;
  composition_assets: CompositionAsset[];
  auto_mask_info?: Record<string, unknown>[];
  original_video_id?: string;
  seed?: number;
}

export interface FusionParams extends QualityParams, DurationParams {
  kind: 'fusion';
  composition_assets: CompositionAsset[];
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
  | VideoModifyParams
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
  'video_modify',
  'fusion',
] as const;

export type OperationType = typeof OPERATION_TYPES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Operation Metadata Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Media type enum - imported from backend OpenAPI schema.
 * Full enum includes: 'video' | 'image' | 'audio' | '3d_model'
 *
 * Note: Operation metadata only uses 'image' | 'video' for input/output,
 * but the full type is preserved for type safety with backend responses.
 */
export type { MediaType };

export type MultiAssetMode = 'optional' | 'required';

export interface OperationMetadata {
  /** Display label */
  label: string;
  /** Icon name for UI display (omit for text-only operations) */
  icon?: string;
  /** Brand color for buttons/badges (omit for text-only operations) */
  color?: string;
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
  /**
   * Role assigned to composition_assets when building params.
   * null = no composition_assets (text_to_* operations).
   * Used by generic param assembly in quickGenerateLogic.
   */
  compositionRole: string | null;
  /**
   * Primary input media type for source asset resolution.
   * 'video' = resolve video inputs, 'image' = resolve image inputs, null = no source.
   */
  inputMediaType: 'video' | 'image' | null;
  /** Params to hide in the settings panel (e.g. duration for transitions) */
  hiddenParams?: string[];
  /** Allow duplicate assets in input list (e.g. transitions) */
  allowDuplicateInputs?: boolean;
  /** Whether source asset is optional (operation falls back to text-only) */
  flexibleInput?: boolean;
  /** Whether aspect ratio is inherited from source (hides aspect_ratio param) */
  inheritsAspectRatio?: boolean;
  /** Default prompt placeholder text */
  promptPlaceholder?: string;
  /** Prompt placeholder when asset is loaded (overrides default) */
  promptPlaceholderWithAsset?: string;
  /** Fallback max input slots when provider specs aren't loaded */
  maxSlots?: number;
}

/**
 * Centralized metadata for all operation types.
 * Use this instead of scattered if/elif checks throughout the codebase.
 */
export const OPERATION_METADATA: Record<OperationType, OperationMetadata> = {
  text_to_image: {
    label: 'Text to Image',
    description: 'Generate an image from a text prompt',
    multiAssetMode: 'optional',
    acceptsInput: [],
    outputType: 'image',
    promptRequired: true,
    promptSupported: true,
    compositionRole: null,
    inputMediaType: null,
    promptPlaceholder: 'Describe the image you want to create...',
  },
  text_to_video: {
    label: 'Text to Video',
    description: 'Generate a video from a text prompt',
    multiAssetMode: 'optional',
    acceptsInput: [],
    outputType: 'video',
    promptRequired: true,
    promptSupported: true,
    compositionRole: null,
    inputMediaType: null,
    promptPlaceholder: 'Describe the video you want to create...',
  },
  image_to_video: {
    label: 'Image to Video',
    icon: 'film',
    color: '#2563EB',
    description: 'Animate an image into a video',
    multiAssetMode: 'optional',
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
    compositionRole: 'source_image',
    inputMediaType: 'image',
    flexibleInput: true,
    inheritsAspectRatio: true,
    promptPlaceholder: 'Describe the video...',
    promptPlaceholderWithAsset: 'Describe the motion...',
  },
  image_to_image: {
    label: 'Image Generation',
    icon: 'image',
    color: '#8B5CF6',
    description: 'Transform or edit an image',
    multiAssetMode: 'optional',
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'image',
    promptRequired: false,
    promptSupported: true,
    compositionRole: 'source_image',
    inputMediaType: 'image',
    flexibleInput: true,
    maxSlots: 7,
    promptPlaceholder: 'Describe the image...',
    promptPlaceholderWithAsset: 'Describe the transformation...',
  },
  video_extend: {
    label: 'Video Extend',
    icon: 'arrowRight',
    color: '#0891B2',
    description: 'Extend a video with additional frames',
    multiAssetMode: 'optional',
    acceptsInput: ['video'],
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
    compositionRole: 'source_video',
    inputMediaType: 'video',
    inheritsAspectRatio: true,
    promptPlaceholder: 'Describe how to continue the video...',
  },
  video_transition: {
    label: 'Video Transition',
    icon: 'arrowRightLeft',
    color: '#D97706',
    description: 'Create transitions between multiple images',
    multiAssetMode: 'required',
    acceptsInput: ['image', 'video'], // video via frame extraction
    outputType: 'video',
    promptRequired: true,
    promptSupported: true,
    compositionRole: 'transition_input',
    inputMediaType: 'image',
    hiddenParams: ['duration'],
    allowDuplicateInputs: true,
    maxSlots: 7,
    promptPlaceholder: 'Describe the motion...',
  },
  video_modify: {
    label: 'Video Modify',
    icon: 'pencil',
    color: '#0D9488',
    description: 'Modify a video with mask-based editing',
    multiAssetMode: 'optional',
    acceptsInput: ['video'],
    outputType: 'video',
    promptRequired: true,
    promptSupported: true,
    compositionRole: 'source_video',
    inputMediaType: 'video',
    inheritsAspectRatio: true,
    promptPlaceholder: 'Describe the edit to apply...',
  },
  fusion: {
    label: 'Fusion',
    icon: 'layers',
    color: '#DC2626',
    description: 'Blend multiple assets together',
    multiAssetMode: 'optional',
    acceptsInput: ['image', 'video'],
    outputType: 'video',
    promptRequired: false,
    promptSupported: true,
    compositionRole: 'source_image',
    inputMediaType: 'image',
    maxSlots: 3,
    promptPlaceholder: 'Describe the fusion...',
  },
};

/**
 * Check if an operation supports multiple input assets.
 * Always true — all operations use the multi-input path.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isMultiAssetOperation(_operationType: OperationType): boolean {
  return true;
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
 * Check if operation requires a prompt
 */
export function operationRequiresPrompt(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.promptRequired ?? false;
}

/**
 * Check if operation supports optional prompt
 */
export function operationSupportsPrompt(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.promptSupported ?? false;
}

/**
 * Check if operation requires an image input
 */
export function operationRequiresImage(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.inputMediaType === 'image';
}

/**
 * Check if operation requires a video input
 */
export function operationRequiresVideo(operationType: OperationType): boolean {
  return OPERATION_METADATA[operationType]?.inputMediaType === 'video';
}

/**
 * Check if an asset's media type is compatible with an operation.
 * This is a convenience wrapper around operationAcceptsMediaType that handles
 * the common case of checking asset compatibility.
 *
 * @param assetMediaType - The media type of the asset ('image' | 'video')
 * @param operationType - The operation to check compatibility for
 * @returns true if the asset can be used as input for the operation
 *
 * @example
 * // Check if an image asset can be used for image_to_video
 * if (isAssetCompatibleWithOperation('image', 'image_to_video')) {
 *   // Asset is compatible
 * }
 */
export function isAssetCompatibleWithOperation(
  assetMediaType: MediaType,
  operationType: OperationType
): boolean {
  return operationAcceptsMediaType(operationType, assetMediaType);
}

/**
 * Get the appropriate fallback operation when an asset is incompatible.
 * For image-based operations without an image, falls back to text-to-* equivalent.
 *
 * @param operationType - The original operation type
 * @param hasAssetInput - Whether any valid asset input was provided
 * @returns The effective operation type to use
 */
export function getFallbackOperation(
  operationType: OperationType,
  hasAssetInput: boolean
): OperationType {
  if (hasAssetInput) {
    return operationType;
  }

  // Fallback to text-to-* when no asset provided for image-based operations
  switch (operationType) {
    case 'image_to_video':
      return 'text_to_video';
    case 'image_to_image':
      return 'text_to_image';
    default:
      return operationType;
  }
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
      if (!Array.isArray(params.composition_assets) || params.composition_assets.length === 0) {
        errors.push('image_to_video requires non-empty composition_assets array');
      }
      break;

    case 'image_to_image':
      if (!params.prompt || typeof params.prompt !== 'string') {
        errors.push('image_to_image requires a prompt (string)');
      }
      if (!Array.isArray(params.composition_assets) || params.composition_assets.length === 0) {
        errors.push('image_to_image requires non-empty composition_assets array');
      }
      if (params.strength !== undefined && (typeof params.strength !== 'number' || params.strength < 0 || params.strength > 1)) {
        errors.push('image_to_image strength must be a number between 0 and 1');
      }
      break;

    case 'video_extend':
      if (!Array.isArray(params.composition_assets) || params.composition_assets.length === 0) {
        errors.push('video_extend requires non-empty composition_assets array');
      }
      break;

    case 'video_transition':
      if (!Array.isArray(params.composition_assets) || params.composition_assets.length < 2) {
        errors.push('video_transition requires composition_assets with at least 2 entries');
      }
      if (!Array.isArray(params.prompts) || params.prompts.length === 0) {
        errors.push('video_transition requires non-empty prompts array');
      }
      if (
        Array.isArray(params.composition_assets) &&
        Array.isArray(params.prompts) &&
        params.prompts.length !== params.composition_assets.length - 1
      ) {
        errors.push('video_transition: prompts length must be composition_assets.length - 1');
      }
      break;

    case 'fusion':
      if (!Array.isArray(params.composition_assets) || params.composition_assets.length === 0) {
        errors.push('fusion requires non-empty composition_assets array');
      }
      break;
  }

  return errors;
}
