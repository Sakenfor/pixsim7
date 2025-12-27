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
  sourceAssetIds?: number[];
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
    sourceAssetIds,
    prompts,
    activeAsset,
    mainQueueCurrent,
  } = context;

  const trimmedPrompt = prompt.trim();
  let inferredSourceAssetId: number | undefined;
  let inferredSourceAssetIds: number[] | undefined;

  // Helper to resolve a single-asset input (prefers queue, then dynamic param, then active selection)
  const resolveSingleSourceAssetId = (options: {
    allowVideo?: boolean;
  } = {}): number | undefined => {
    const allowVideo = options.allowVideo ?? false;
    let sourceAssetId = dynamicParams.source_asset_id;
    const queueAssetId =
      mainQueueCurrent && (
        mainQueueCurrent.asset.mediaType === 'image' ||
        (allowVideo && mainQueueCurrent.asset.mediaType === 'video')
      )
        ? mainQueueCurrent.asset.id
        : undefined;

    if (queueAssetId) {
      sourceAssetId = queueAssetId;
    } else if (!sourceAssetId && activeAsset) {
      const isImage = activeAsset.type === 'image';
      const isVideo = activeAsset.type === 'video';
      if (isImage || (allowVideo && isVideo)) {
        sourceAssetId = activeAsset.id;
      }
    }

    return sourceAssetId;
  };

  // Helper to strip legacy URL params once asset IDs are present
  const stripLegacyAssetParams = (params: Record<string, any>) => {
    if (params.source_asset_id || (Array.isArray(params.source_asset_ids) && params.source_asset_ids.length > 0)) {
      delete params.image_url;
      delete params.image_urls;
      delete params.video_url;
      delete params.original_video_id;
    }
  };

  // Operation-specific validation with context-aware messages
  if ((operationType === 'text_to_video' || operationType === 'text_to_image') && !trimmedPrompt) {
    return {
      error: 'Please enter a prompt describing what you want to generate.',
      finalPrompt: trimmedPrompt,
    };
  }

  if (operationType === 'image_to_image') {
    // Priority: multi-asset list > queue selection > dynamic params > activeAsset
    // NOTE: Legacy image_url is no longer checked - use source_asset_id(s) only
    const multiSourceIds = Array.isArray(dynamicParams.source_asset_ids) && dynamicParams.source_asset_ids.length > 0
      ? dynamicParams.source_asset_ids
      : Array.isArray(sourceAssetIds) && sourceAssetIds.length > 0
        ? sourceAssetIds
        : undefined;

    if (multiSourceIds?.length) {
      if (!dynamicParams.source_asset_ids) {
        inferredSourceAssetIds = multiSourceIds;
      }

      if (!trimmedPrompt) {
        return {
          error: 'Please enter a prompt describing how to transform the image.',
          finalPrompt: trimmedPrompt,
        };
      }
    } else {
      let sourceAssetId = dynamicParams.source_asset_id;
      const queueAssetId = mainQueueCurrent?.asset.mediaType === 'image'
        ? mainQueueCurrent.asset.id
        : undefined;

      if (queueAssetId) {
        sourceAssetId = queueAssetId;
      } else if (!sourceAssetId && activeAsset?.type === 'image') {
        sourceAssetId = activeAsset.id;
      }

      // Validate we have an asset ID
      if (!sourceAssetId) {
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

      if (!dynamicParams.source_asset_id && sourceAssetId) {
        inferredSourceAssetId = sourceAssetId;
      }
    }
  }

  if (operationType === 'image_to_video') {
    // Priority: queue selection > dynamic params > activeAsset
    // NOTE: Legacy image_url is no longer checked - use source_asset_id only
    const sourceAssetId = resolveSingleSourceAssetId({ allowVideo: true });

    // Validate prompt if we have an asset (optional - can fall back to text_to_video)
    // If no asset, the caller will handle switching to text_to_video
    if (sourceAssetId && !trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing the motion/action for Image to Video.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (!dynamicParams.source_asset_id && sourceAssetId) {
      inferredSourceAssetId = sourceAssetId;
    }
  }

  if (operationType === 'video_extend') {
    // Priority: queue selection > dynamic params > activeAsset
    // NOTE: Legacy video_url/original_video_id are no longer checked - use source_asset_id only
    let sourceAssetId = dynamicParams.source_asset_id;
    const queueAssetId = mainQueueCurrent?.asset.mediaType === 'video'
      ? mainQueueCurrent.asset.id
      : undefined;

    if (queueAssetId) {
      sourceAssetId = queueAssetId;
    } else if (!sourceAssetId && activeAsset?.type === 'video') {
      sourceAssetId = activeAsset.id;
    }

    // Validate we have an asset ID
    if (!sourceAssetId) {
      return {
        error: 'No video selected. Click "Video Extend" on a gallery video to extend it.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (!dynamicParams.source_asset_id && sourceAssetId) {
      inferredSourceAssetId = sourceAssetId;
    }
  }

  let transitionDurations: number[] | undefined;
  if (operationType === 'video_transition') {
    // NOTE: Legacy image_urls is no longer checked - use source_asset_ids only
    const transitionSourceIds = Array.isArray(dynamicParams.source_asset_ids)
      ? dynamicParams.source_asset_ids
      : Array.isArray(sourceAssetIds)
        ? sourceAssetIds
        : [];
    const assetCount = transitionSourceIds.length;
    const validPrompts = prompts.map(s => s.trim()).filter(Boolean);

    if (!assetCount) {
      return {
        error: 'No images in transition queue. Use "Add to Transition" from the gallery to add images.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (assetCount < 2) {
      return {
        error: 'Need at least 2 images to create a transition.',
        finalPrompt: trimmedPrompt,
      };
    }

    const expectedPrompts = assetCount - 1;
    if (!validPrompts.length) {
      return {
        error: `Transition prompts are required. Add ${expectedPrompts} prompt${expectedPrompts > 1 ? 's' : ''} describing the transitions between your ${assetCount} images.`,
        finalPrompt: trimmedPrompt,
      };
    }

    if (validPrompts.length !== expectedPrompts) {
      return {
        error: `You have ${assetCount} images but ${validPrompts.length} prompts. You need exactly ${expectedPrompts} prompt${expectedPrompts > 1 ? 's' : ''} (one for each transition between images).`,
        finalPrompt: trimmedPrompt,
      };
    }

    if (expectedPrompts > 0) {
      transitionDurations = sanitizeTransitionDurations(
        context.transitionDurations,
        expectedPrompts
      );
    }

    if (!dynamicParams.source_asset_ids && transitionSourceIds.length) {
      inferredSourceAssetIds = transitionSourceIds;
    }
  }

  // Build params - merge preset params, dynamic params, and operation-specific params
  const params: Record<string, any> = {
    prompt: trimmedPrompt,
    ...presetParams,
    ...dynamicParams,
  };

  if (inferredSourceAssetId && !params.source_asset_id) {
    params.source_asset_id = inferredSourceAssetId;
  }

  if (inferredSourceAssetIds && !params.source_asset_ids) {
    params.source_asset_ids = inferredSourceAssetIds;
  }

  // Drop legacy URL params when asset IDs are present to avoid leaking img_id refs
  stripLegacyAssetParams(params);

  // Add array fields for video_transition
  if (operationType === 'video_transition') {
    // NOTE: Legacy image_urls fallback removed - source_asset_ids is now required
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
