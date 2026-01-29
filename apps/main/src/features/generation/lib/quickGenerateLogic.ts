import { normalizeProviderParams } from '@pixsim7/shared.generation.core';

import type { SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import type { InputItem } from '@features/generation';

import { useCompositionPackageStore } from '@/stores/compositionPackageStore';
import type { OperationType } from '@/types/operations';

// Re-export for backwards compatibility
export type { OperationType };

export interface QuickGenerateContext {
  operationType: OperationType;
  prompt: string;
  presetParams: Record<string, any>;
  dynamicParams: Record<string, any>;
  operationInputs?: InputItem[];
  prompts: string[];
  transitionDurations?: number[];
  activeAsset?: SelectedAsset;
  currentInput?: InputItem;
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
    operationInputs = [],
    prompts,
    activeAsset,
    currentInput,
  } = context;

  const trimmedPrompt = prompt.trim();
  let inferredSourceAssetId: number | undefined;
  let inferredSourceAssetIds: number[] | undefined;

  const resolveSingleSourceAssetId = (options: {
    allowVideo?: boolean;
  } = {}): number | undefined => {
    const allowVideo = options.allowVideo ?? false;
    let sourceAssetId = dynamicParams.source_asset_id;
    const inputAssetId =
      currentInput && (
        currentInput.asset.mediaType === 'image' ||
        (allowVideo && currentInput.asset.mediaType === 'video')
      )
        ? currentInput.asset.id
        : undefined;

    // DEBUG: Log resolution steps
    const debugSource: string[] = [];
    if (dynamicParams.source_asset_id) {
      debugSource.push(`dynamicParams: ${dynamicParams.source_asset_id}`);
    }
    if (inputAssetId) {
      debugSource.push(`currentInput: ${inputAssetId} (${currentInput?.asset?.mediaType})`);
    }
    if (activeAsset) {
      debugSource.push(`activeAsset: ${activeAsset.id} (${activeAsset.type})`);
    }

    if (inputAssetId) {
      sourceAssetId = inputAssetId;
      console.log(`[DEBUG resolveSingleSourceAssetId] Using currentInput: ${sourceAssetId}`, { sources: debugSource });
    } else if (!sourceAssetId && activeAsset) {
      const isImage = activeAsset.type === 'image';
      const isVideo = activeAsset.type === 'video';
      if (isImage || (allowVideo && isVideo)) {
        sourceAssetId = activeAsset.id;
        console.log(`[DEBUG resolveSingleSourceAssetId] Fallback to activeAsset: ${sourceAssetId}`, { sources: debugSource });
      }
    } else if (sourceAssetId) {
      console.log(`[DEBUG resolveSingleSourceAssetId] Using dynamicParams: ${sourceAssetId}`, { sources: debugSource });
    } else {
      console.log(`[DEBUG resolveSingleSourceAssetId] No source found`, { sources: debugSource });
    }

    return sourceAssetId;
  };

  const getTagStrings = (asset: { tags?: Array<{ slug?: string; name?: string }> }): string[] => {
    return (asset.tags ?? [])
      .map(t => t.slug ?? t.name ?? '')
      .filter(Boolean);
  };

  const resolveCompositionAssetsFromInputs = (
    inputs: InputItem[] | undefined
  ): Array<{ asset: string; layer: number; role: string }> | undefined => {
    if (!inputs || inputs.length === 0) return undefined;
    return inputs.map((item, index) => {
      const tags = getTagStrings(item.asset);
      const inferredRole = useCompositionPackageStore.getState().inferRoleFromTags(tags);
      const defaultRole = index === 0 ? 'environment' : 'main_character';
      return {
        asset: `asset:${item.asset.id}`,
        layer: index,
        role: inferredRole ?? defaultRole,
      };
    });
  };

  if ((operationType === 'text_to_video' || operationType === 'text_to_image') && !trimmedPrompt) {
    return {
      error: 'Please enter a prompt describing what you want to generate.',
      finalPrompt: trimmedPrompt,
    };
  }

  if (operationType === 'image_to_image') {
    const explicitCompositionAssets =
      Array.isArray(dynamicParams.composition_assets) && dynamicParams.composition_assets.length > 0
        ? dynamicParams.composition_assets
        : undefined;
    const paramsSourceIds = Array.isArray(dynamicParams.source_asset_ids) && dynamicParams.source_asset_ids.length > 0
      ? dynamicParams.source_asset_ids
      : undefined;
    const inputSourceIds = operationInputs.length > 0
      ? operationInputs.map((item) => item.asset.id)
      : undefined;

    let resolvedSourceIds = paramsSourceIds ?? inputSourceIds;

    if (!resolvedSourceIds && !explicitCompositionAssets) {
      const fallbackId = resolveSingleSourceAssetId();
      if (fallbackId) {
        resolvedSourceIds = [fallbackId];
      }
    }

    if (!resolvedSourceIds && !explicitCompositionAssets) {
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

    if (resolvedSourceIds && !dynamicParams.source_asset_ids) {
      inferredSourceAssetIds = resolvedSourceIds;
    }
  }

  if (operationType === 'fusion') {
    const explicitCompositionAssets =
      Array.isArray(dynamicParams.composition_assets) && dynamicParams.composition_assets.length > 0
        ? dynamicParams.composition_assets
        : undefined;
    const paramsSourceIds = Array.isArray(dynamicParams.source_asset_ids) && dynamicParams.source_asset_ids.length > 0
      ? dynamicParams.source_asset_ids
      : undefined;
    const inputSourceIds = operationInputs.length > 0
      ? operationInputs.map((item) => item.asset.id)
      : undefined;

    let resolvedSourceIds = paramsSourceIds ?? inputSourceIds;

    if (!resolvedSourceIds && !explicitCompositionAssets) {
      const fallbackId = resolveSingleSourceAssetId({ allowVideo: true });
      if (fallbackId) {
        resolvedSourceIds = [fallbackId];
      }
    }

    if (!resolvedSourceIds && !explicitCompositionAssets) {
      return {
        error: 'No images selected. Add an image from the gallery to fuse.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (resolvedSourceIds && !dynamicParams.source_asset_ids) {
      inferredSourceAssetIds = resolvedSourceIds;
    }
  }

  if (operationType === 'image_to_video') {
    const sourceAssetId = resolveSingleSourceAssetId({ allowVideo: true });

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
    const sourceAssetId = resolveSingleSourceAssetId({ allowVideo: true });

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
    const transitionSourceIds = Array.isArray(dynamicParams.source_asset_ids) && dynamicParams.source_asset_ids.length > 0
      ? dynamicParams.source_asset_ids
      : operationInputs.map((item) => item.asset.id);
    const assetCount = transitionSourceIds.length;
    const validPrompts = prompts.map(s => s.trim()).filter(Boolean);

    if (!assetCount) {
      return {
        error: 'No images in transition inputs. Use "Add to Transition" from the gallery to add images.',
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

  const params: Record<string, any> = {
    prompt: trimmedPrompt,
    ...presetParams,
    ...dynamicParams,
  };

  if (inferredSourceAssetId) {
    params.source_asset_id = inferredSourceAssetId;
  }

  if (inferredSourceAssetIds) {
    params.source_asset_ids = inferredSourceAssetIds;
  }

  if (operationType === 'image_to_image') {
    const inputCompositionAssets = resolveCompositionAssetsFromInputs(operationInputs);
    if (inputCompositionAssets) {
      params.composition_assets = inputCompositionAssets;
    } else if (!params.composition_assets) {
      const sourceIds = Array.isArray(params.source_asset_ids)
        ? params.source_asset_ids
        : params.source_asset_id
          ? [params.source_asset_id]
          : [];

      if (sourceIds.length > 0) {
        params.composition_assets = sourceIds.map((id: number, index: number) => ({
          asset: `asset:${id}`,
          layer: index,
          role: index === 0 ? 'environment' : 'main_character',
        }));
      }
    }

    delete params.source_asset_id;
    delete params.source_asset_ids;
  }

  if (operationType === 'fusion') {
    const inputCompositionAssets = resolveCompositionAssetsFromInputs(operationInputs);
    if (inputCompositionAssets) {
      params.composition_assets = inputCompositionAssets;
    } else if (!params.composition_assets) {
      const sourceIds = Array.isArray(params.source_asset_ids)
        ? params.source_asset_ids
        : params.source_asset_id
          ? [params.source_asset_id]
          : [];

      if (sourceIds.length > 0) {
        params.composition_assets = sourceIds.map((id: number, index: number) => ({
          asset: `asset:${id}`,
          layer: index,
          role: index === 0 ? 'environment' : 'main_character',
        }));
      }
    }

    delete params.source_asset_id;
    delete params.source_asset_ids;
  }

  if (operationType === 'video_transition') {
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
