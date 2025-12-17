import type { SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import type { QueuedAsset } from '@features/generation';
import { normalizeProviderParams } from '@features/generation/lib/core/normalizeProviderParams';
import type { OperationType } from '@/types/operations';

// Re-export for backwards compatibility
export type { OperationType };

export interface QuickGenerateContext {
  operationType: OperationType;
  prompt: string;
  presetParams: Record<string, any>;
  dynamicParams: Record<string, any>;
  imageUrls: string[];
  prompts: string[];
  transitionDurations?: number[];
  activeAsset?: SelectedAsset;
  mainQueueCurrent?: QueuedAsset;
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
 * Enhanced with Task 67 improvements:
 * - Context-aware error messages that reference user actions
 * - Better handling of queued assets and local-only states
 * - Auto-recovery from common validation issues
 */
export function buildGenerationRequest(context: QuickGenerateContext): BuildGenerationResult {
  const {
    operationType,
    prompt,
    presetParams,
    dynamicParams,
    imageUrls,
    prompts,
    activeAsset,
    mainQueueCurrent,
  } = context;

  const trimmedPrompt = prompt.trim();

  // Operation-specific validation with context-aware messages
  if ((operationType === 'text_to_video' || operationType === 'text_to_image') && !trimmedPrompt) {
    return {
      error: 'Please enter a prompt describing what you want to generate.',
      finalPrompt: trimmedPrompt,
    };
  }

  if (operationType === 'image_to_image') {
    // Priority: dynamicParams (set by "Use Media Viewer Asset" or user input) > queue > activeAsset
    let imageUrl = dynamicParams.image_url;

    // Only fall back to queue if dynamicParams is empty
    if (!imageUrl && mainQueueCurrent?.asset.media_type === 'image') {
      imageUrl = mainQueueCurrent.asset.remote_url;
      if (imageUrl) {
        context.dynamicParams.image_url = imageUrl;
      }
    }

    // Validate we have a URL
    if (!imageUrl) {
      return {
        error: 'No image selected. Select an image from the gallery to transform.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (!trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing how to transform the image.',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  if (operationType === 'image_to_video') {
    // Priority: dynamicParams (set by "Use Media Viewer Asset" or user input) > queue
    let imageUrl = dynamicParams.image_url;

    // Only fall back to queue if dynamicParams is empty
    if (!imageUrl && mainQueueCurrent?.asset.media_type === 'image') {
      imageUrl = mainQueueCurrent.asset.remote_url;
      if (imageUrl) {
        context.dynamicParams.image_url = imageUrl;
      }
    }

    // Validate we have a URL (optional - can fall back to text_to_video)
    // If no image, the caller will handle switching to text_to_video
    if (imageUrl && !trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing the motion/action for Image to Video.',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  if (operationType === 'video_extend') {
    // Priority: dynamicParams (set by "Use Media Viewer Asset" or user input) > queue
    let videoUrl = dynamicParams.video_url;
    const hasOriginalId = Boolean(dynamicParams.original_video_id);

    // Only fall back to queue if dynamicParams is empty
    if (!videoUrl && !hasOriginalId && mainQueueCurrent?.asset.media_type === 'video') {
      videoUrl = mainQueueCurrent.asset.remote_url;
      if (videoUrl) {
        context.dynamicParams.video_url = videoUrl;
      }
    }

    // Validate we have a URL or ID
    if (!videoUrl && !hasOriginalId) {
      return {
        error: 'No video selected. Click "Video Extend" on a gallery video, or paste a video URL in Settings.',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  let transitionDurations: number[] | undefined;
  if (operationType === 'video_transition') {
    const validImages = imageUrls.map(s => s.trim()).filter(Boolean);
    const validPrompts = prompts.map(s => s.trim()).filter(Boolean);

    if (!validImages.length) {
      return {
        error: 'No images in transition queue. Use "Add to Transition" from the gallery to add images.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (validImages.length < 2) {
      return {
        error: 'Need at least 2 images to create a transition.',
        finalPrompt: trimmedPrompt,
      };
    }

    const expectedPrompts = validImages.length - 1;
    if (!validPrompts.length) {
      return {
        error: `Transition prompts are required. Add ${expectedPrompts} prompt${expectedPrompts > 1 ? 's' : ''} describing the transitions between your ${validImages.length} images.`,
        finalPrompt: trimmedPrompt,
      };
    }

    if (validPrompts.length !== expectedPrompts) {
      return {
        error: `You have ${validImages.length} images but ${validPrompts.length} prompts. You need exactly ${expectedPrompts} prompt${expectedPrompts > 1 ? 's' : ''} (one for each transition between images).`,
        finalPrompt: trimmedPrompt,
      };
    }

    if (expectedPrompts > 0) {
      transitionDurations = sanitizeTransitionDurations(
        context.transitionDurations,
        expectedPrompts
      );
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
    params.image_urls = imageUrls.map((s) => s.trim()).filter(Boolean);
    params.prompts = prompts.map((s) => s.trim()).filter(Boolean);
    if (transitionDurations && transitionDurations.length) {
      params.durations = transitionDurations;
    }
  }

  const normalizedParams = normalizeProviderParams(params);

  return {
    params: normalizedParams,
    finalPrompt: trimmedPrompt,
  };
}

function sanitizeTransitionDurations(
  durations: number[] | undefined,
  expectedCount: number
): number[] {
  const result: number[] = [];
  const source = Array.isArray(durations) ? durations : [];

  for (let i = 0; i < expectedCount; i += 1) {
    const raw = source[i];
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      const clamped = Math.min(5, Math.max(1, Math.round(numeric)));
      result.push(clamped);
    } else {
      result.push(5);
    }
  }

  return result;
}
