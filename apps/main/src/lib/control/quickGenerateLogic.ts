import type { ControlCenterState } from '../../stores/controlCenterStore';
import type { SelectedAsset } from '../../stores/assetSelectionStore';
import type { QueuedAsset } from '../../stores/generationQueueStore';

export type OperationType = ControlCenterState['operationType'];

export interface QuickGenerateContext {
  operationType: OperationType;
  prompt: string;
  presetParams: Record<string, any>;
  dynamicParams: Record<string, any>;
  imageUrls: string[];
  prompts: string[];
  activeAsset?: SelectedAsset;
  mainQueueFirst?: QueuedAsset;
}

export interface BuildGenerationResult {
  /**
   * Optional error message when validation fails.
   */
  error?: string;

  /**
   * Fully merged params to send to the backend when validation succeeds.
   */
  params?: Record<string, any>;

  /**
   * Trimmed prompt that should be used for generation and history.
   */
  finalPrompt: string;
}

/**
 * Build and validate a generation request for QuickGenerateModule.
 *
 * This helper centralizes operation-specific validation and parameter
 * construction so the React component can stay mostly presentational.
 *
 * NOTE: Current behavior mirrors the existing inline logic in
 * QuickGenerateModule. Future UX changes (Task 67) should extend
 * this function rather than re-adding logic in the UI layer.
 */
export function buildGenerationRequest(context: QuickGenerateContext): BuildGenerationResult {
  const {
    operationType,
    prompt,
    presetParams,
    dynamicParams,
    imageUrls,
    prompts,
  } = context;

  const trimmedPrompt = prompt.trim();

  // Operation-specific validation
  if (operationType === 'text_to_video' && !trimmedPrompt) {
    return {
      error: 'Prompt is required for text-to-video',
      finalPrompt: trimmedPrompt,
    };
  }

  if (operationType === 'image_to_video' && !dynamicParams.image_url) {
    return {
      error: 'Image URL is required for image-to-video',
      finalPrompt: trimmedPrompt,
    };
  }

  if (operationType === 'video_extend') {
    const hasVideoUrl = Boolean(dynamicParams.video_url);
    const hasOriginalId = Boolean(dynamicParams.original_video_id);

    if (!hasVideoUrl && !hasOriginalId) {
      return {
        error: 'Either video URL or provider video ID is required',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  if (operationType === 'video_transition') {
    const validImages = imageUrls.map(s => s.trim()).filter(Boolean);
    const validPrompts = prompts.map(s => s.trim()).filter(Boolean);

    if (!validImages.length || !validPrompts.length) {
      return {
        error: 'Both image URLs and prompts are required for video transition',
        finalPrompt: trimmedPrompt,
      };
    }

    if (validImages.length !== validPrompts.length) {
      return {
        error: 'Number of image URLs must match number of prompts',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  // Build params - merge preset params, dynamic params, and operation-specific params
  const params: Record<string, any> = {
    prompt: trimmedPrompt,
    ...presetParams,
    ...dynamicParams,
  };

  // Add array fields for video_transition
  if (operationType === 'video_transition') {
    params.image_urls = imageUrls.map(s => s.trim()).filter(Boolean);
    params.prompts = prompts.map(s => s.trim()).filter(Boolean);
  }

  return {
    params,
    finalPrompt: trimmedPrompt,
  };
}

