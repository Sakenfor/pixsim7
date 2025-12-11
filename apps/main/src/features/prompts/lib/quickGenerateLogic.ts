import type { SelectedAsset } from '@/stores/assetSelectionStore';
import type { QueuedAsset } from '@/stores/generationQueueStore';
import { normalizeProviderParams } from '@/lib/generation/normalizeProviderParams';
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
    mainQueueFirst,
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
    // Try auto-recovery: use queued asset or active asset if available
    let imageUrl = dynamicParams.image_url;

    if (!imageUrl && mainQueueFirst?.asset.media_type === 'image') {
      imageUrl = mainQueueFirst.asset.remote_url;
      if (imageUrl) {
        context.dynamicParams.image_url = imageUrl;
      }
    }

    if (!imageUrl && activeAsset?.type === 'image') {
      imageUrl = activeAsset.url;
      if (imageUrl) {
        context.dynamicParams.image_url = imageUrl;
      }
    }

    // Still no URL? Provide context-aware error
    if (!imageUrl) {
      if (mainQueueFirst?.asset.media_type === 'image' && !mainQueueFirst.asset.remote_url) {
        return {
          error: 'The queued image is local-only and has no cloud URL. Upload it to the provider first, or select a different image.',
          finalPrompt: trimmedPrompt,
        };
      }

      if (activeAsset?.type === 'image') {
        return {
          error: 'The selected image has no usable URL. Try selecting a gallery image that has been uploaded to the provider.',
          finalPrompt: trimmedPrompt,
        };
      }

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
    // Try auto-recovery: use queued asset or active asset if available
    let imageUrl = dynamicParams.image_url;

    if (!imageUrl && mainQueueFirst?.asset.media_type === 'image') {
      imageUrl = mainQueueFirst.asset.remote_url;
      if (imageUrl) {
        // Auto-fill succeeded, update params
        context.dynamicParams.image_url = imageUrl;
      }
    }

    if (!imageUrl && activeAsset?.type === 'image') {
      imageUrl = activeAsset.url;
      if (imageUrl) {
        context.dynamicParams.image_url = imageUrl;
      }
    }

    // Still no URL? Provide context-aware error
    if (!imageUrl) {
      if (mainQueueFirst?.asset.media_type === 'image' && !mainQueueFirst.asset.remote_url) {
        return {
          error: 'The queued image is local-only and has no cloud URL. Upload it to the provider first, or select a different image.',
          finalPrompt: trimmedPrompt,
        };
      }

      if (activeAsset?.type === 'image') {
        return {
          error: 'The selected image has no usable URL. Try selecting a gallery image that has been uploaded to the provider.',
          finalPrompt: trimmedPrompt,
        };
      }

      return {
        error: 'No image selected. Click "Image to Video" on a gallery image, or paste an image URL in Settings.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (!trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing the motion/action for Image to Video.',
        finalPrompt: trimmedPrompt,
      };
    }
  }

  if (operationType === 'video_extend') {
    let videoUrl = dynamicParams.video_url;
    const hasOriginalId = Boolean(dynamicParams.original_video_id);

    // Try auto-recovery: use queued asset or active asset
    if (!videoUrl && !hasOriginalId && mainQueueFirst?.asset.media_type === 'video') {
      videoUrl = mainQueueFirst.asset.remote_url;
      if (videoUrl) {
        context.dynamicParams.video_url = videoUrl;
      }
    }

    if (!videoUrl && !hasOriginalId && activeAsset?.type === 'video') {
      videoUrl = activeAsset.url;
      if (videoUrl) {
        context.dynamicParams.video_url = videoUrl;
      }
    }

    // Still no URL or ID? Provide context-aware error
    if (!videoUrl && !hasOriginalId) {
      if (mainQueueFirst?.asset.media_type === 'video' && !mainQueueFirst.asset.remote_url) {
        return {
          error: 'The queued video is local-only and has no cloud URL. Upload it to the provider first, or select a different video.',
          finalPrompt: trimmedPrompt,
        };
      }

      if (activeAsset?.type === 'video') {
        return {
          error: 'The selected video has no usable URL. Try selecting a gallery video that has been uploaded to the provider.',
          finalPrompt: trimmedPrompt,
        };
      }

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
