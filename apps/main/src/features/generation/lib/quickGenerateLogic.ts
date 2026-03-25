import { normalizeProviderParams } from '@pixsim7/shared.generation.core';

import { getAsset } from '@lib/api/assets';

import { fromAssetResponse, type AssetModel } from '@features/assets';
import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import type { SelectedAsset } from '@features/assets/stores/assetSelectionStore';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import type { InputItem } from '@features/generation';

import { useCompositionPackageStore } from '@/stores/compositionPackageStore';
import { OPERATION_METADATA, type OperationType } from '@/types/operations';

import { pickFromSet } from './pickFromSet';

// Re-export for backwards compatibility
export type { OperationType };

export interface QuickGenerateContext {
  operationType: OperationType;
  prompt: string;
  dynamicParams: Record<string, any>;
  operationInputs?: InputItem[];
  prompts: string[];
  transitionDurations?: number[];
  activeAsset?: SelectedAsset;
  currentInput?: InputItem;
  /** Max prompt chars - prompt is clamped to this limit before sending to API */
  maxChars?: number;
}

export interface PickStateUpdate {
  inputId: string;
  pickedAssetId: number;
  pickIndex?: number;
  recentPicks?: number[];
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

  /**
   * Pick state updates from asset set resolution (sequential index, no-repeat history).
   * The caller should persist these via updatePickState and update display assets.
   */
  pickStateUpdates?: PickStateUpdate[];
}

/**
 * Keep a small prompt headroom below provider-advertised limits.
 * Some providers enforce limits with slight counting differences
 * (normalization/encoding), causing borderline prompts to be rejected.
 */
const PROMPT_CLAMP_HEADROOM_CHARS = 50;

function resolvePromptClampLimit(maxChars?: number): number | undefined {
  if (typeof maxChars !== 'number' || !Number.isFinite(maxChars) || maxChars <= 0) {
    return undefined;
  }

  const normalized = Math.floor(maxChars);
  return normalized > PROMPT_CLAMP_HEADROOM_CHARS
    ? normalized - PROMPT_CLAMP_HEADROOM_CHARS
    : normalized;
}

function asPositiveAssetId(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function resolveAssetUrlFromInput(asset: Partial<InputItem['asset']>): string | undefined {
  const candidates = [
    asset.remoteUrl,
    asset.fileUrl,
    asset.previewUrl,
    asset.thumbnailUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function resolveMaskLayerAssetUrl(layer: any): string | undefined {
  if (!layer || typeof layer !== 'object') return undefined;

  const directUrl =
    typeof layer.assetUrl === 'string' && layer.assetUrl.trim().length > 0
      ? layer.assetUrl.trim()
      : undefined;
  if (directUrl) return directUrl;

  const aliasUrl =
    typeof layer.maskUrl === 'string' && layer.maskUrl.trim().length > 0
      ? layer.maskUrl.trim()
      : undefined;
  if (aliasUrl) return aliasUrl;

  const candidateId =
    (typeof layer.savedAssetId === 'number' && Number.isFinite(layer.savedAssetId)
      ? Math.floor(layer.savedAssetId)
      : undefined)
    ?? (typeof layer.assetId === 'number' && Number.isFinite(layer.assetId)
      ? Math.floor(layer.assetId)
      : undefined)
    ?? (typeof layer.asset?.id === 'number' && Number.isFinite(layer.asset.id)
      ? Math.floor(layer.asset.id)
      : undefined);

  if (typeof candidateId === 'number' && candidateId > 0) {
    return `asset:${candidateId}`;
  }

  return undefined;
}

function isMaskLayerVisible(layer: any): boolean {
  if (!layer || typeof layer !== 'object') return false;
  // Legacy compatibility: treat missing `visible` as enabled.
  return layer.visible !== false;
}

/**
 * Build composition_assets from asset IDs for a given operation type.
 *
 * Encapsulates the per-operation role, media_type, and layer conventions
 * so every code-path (quick-generate, regenerate, extend, etc.) produces
 * the same shape.  Returns `undefined` when the operation type does not
 * use composition_assets or when no valid IDs are provided.
 */
export function buildCompositionAssetsFromAssetIds(
  operationType: OperationType,
  assetIds: number[],
): Array<{ asset: string; role: string; layer?: number; media_type: string }> | undefined {
  const validIds = assetIds.filter((id) => Number.isFinite(id) && Math.floor(id) > 0);
  if (validIds.length === 0) return undefined;

  // Special cases with per-item layer/role logic
  switch (operationType) {
    case 'image_to_image':
    case 'fusion':
      return validIds.map((id, index) => ({
        asset: `asset:${id}`,
        layer: index,
        role: index === 0 ? 'environment' : 'main_character',
        media_type: 'image',
      }));

    case 'video_transition':
      return validIds.map((id, index) => ({
        asset: `asset:${id}`,
        layer: index,
        role: 'transition_input',
        media_type: 'image',
      }));
  }

  // Generic path: use metadata-driven role and media type
  const meta = OPERATION_METADATA[operationType];
  if (!meta?.compositionRole || !meta.inputMediaType) return undefined;

  return validIds.map((id) => ({
    asset: `asset:${id}`,
    role: meta.compositionRole!,
    media_type: meta.inputMediaType!,
  }));
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
export async function buildGenerationRequest(context: QuickGenerateContext): Promise<BuildGenerationResult> {
  const {
    operationType,
    prompt,
    dynamicParams,
    operationInputs = [],
    prompts,
    activeAsset,
    currentInput,
    maxChars,
  } = context;

  const trimmedPrompt = prompt.trim();
  let inferredSourceAssetId: number | undefined;
  let inferredSourceAssetIds: number[] | undefined;

  const resolveSingleSourceAssetId = (options: {
    allowVideo?: boolean;
    allowImage?: boolean;
    allowVideoFallback?: boolean;
  } = {}): number | undefined => {
    const allowVideo = options.allowVideo ?? false;
    const allowImage = options.allowImage ?? true;
    // allowVideoFallback controls whether activeAsset fallback accepts videos
    // Default to false - only explicit input slots should accept videos
    const allowVideoFallback = options.allowVideoFallback ?? false;
    let sourceAssetId = asPositiveAssetId(dynamicParams.source_asset_id);
    const inputAssetId =
      currentInput && (
        (allowImage && currentInput.asset.mediaType === 'image') ||
        (allowVideo && currentInput.asset.mediaType === 'video')
      )
        ? asPositiveAssetId(currentInput.asset.id)
        : undefined;

    if (inputAssetId) {
      // Prefer currentInput over dynamicParams
      sourceAssetId = inputAssetId;
    } else if (!sourceAssetId && activeAsset) {
      const isImage = activeAsset.type === 'image';
      const isVideo = activeAsset.type === 'video';
      // Only allow video fallback if explicitly enabled (e.g., for video_extend)
      // For image_to_video, activeAsset fallback should only accept images
      if ((allowImage && isImage) || (allowVideoFallback && isVideo)) {
        sourceAssetId = asPositiveAssetId(activeAsset.id);
      }
    }

    return sourceAssetId;
  };

  const getTagStrings = (asset: { tags?: Array<{ slug?: string; name?: string }> }): string[] => {
    return (asset.tags ?? [])
      .map(t => t.slug ?? t.name ?? '')
      .filter(Boolean);
  };

  const pickStateUpdates: PickStateUpdate[] = [];

  const resolveCompositionAssetsFromInputs = async (
    inputs: InputItem[] | undefined,
    options: { mediaType?: 'image' | 'video' } = {},
  ): Promise<Array<{ asset?: string; url?: string; layer: number; role: string; media_type?: string }> | undefined> => {
    if (!inputs || inputs.length === 0) return undefined;
    const overrideMediaType = options.mediaType;
    const resolved = await Promise.all(inputs.map(async (item, index) => {
      // Resolve asset set reference if present
      let resolvedAsset: AssetModel = item.asset;
      if (item.assetSetRef) {
        const set = useAssetSetStore.getState().getSet(item.assetSetRef.setId);
        if (set) {
          if (item.assetSetRef.mode === 'locked') {
            if (item.assetSetRef.lockedAssetId) {
              try {
                const fetched = await getAsset(item.assetSetRef.lockedAssetId);
                resolvedAsset = fromAssetResponse(fetched);
              } catch {
                // Fall back to current display asset
                console.warn(`[pickFromSet] Failed to fetch locked asset ${item.assetSetRef.lockedAssetId}, using display asset`);
              }
            } else {
              // Bug 3: locked mode without lockedAssetId - treat as random pick with warning
              console.warn(`[pickFromSet] Locked mode without lockedAssetId on input ${item.id}, falling back to random pick`);
              const setAssets = await resolveAssetSet(set);
              if (setAssets.length > 0) {
                const result = pickFromSet(setAssets, item.assetSetRef.pickStrategy, item.assetSetRef);
                resolvedAsset = result.asset;
                pickStateUpdates.push({
                  inputId: item.id,
                  pickedAssetId: result.asset.id,
                  ...result.updatedRef,
                });
              }
            }
          } else {
            // random_each - resolve set, pick using strategy
            const setAssets = await resolveAssetSet(set);
            if (setAssets.length > 0) {
              const result = pickFromSet(setAssets, item.assetSetRef.pickStrategy, item.assetSetRef);
              resolvedAsset = result.asset;
              pickStateUpdates.push({
                inputId: item.id,
                pickedAssetId: result.asset.id,
                ...result.updatedRef,
              });
            }
          }
        } else {
          // Bug 1: set not found - warn instead of silent fallback
          console.warn(`[pickFromSet] Asset set "${item.assetSetRef.setId}" not found, using display asset`);
        }
      }

      let role: string;
      if (item.roleOverride) {
        role = item.roleOverride;
      } else {
        const tags = getTagStrings(resolvedAsset);
        const inferredRole = useCompositionPackageStore.getState().inferRoleFromTags(tags);
        role = inferredRole ?? (index === 0 ? 'environment' : 'main_character');
      }
      const mediaType = overrideMediaType ?? resolvedAsset.mediaType ?? 'image';
      const assetId = asPositiveAssetId(resolvedAsset.id);
      const url = assetId ? undefined : resolveAssetUrlFromInput(resolvedAsset);
      if (!assetId && !url) {
        return null;
      }
      return {
        ...(assetId ? { asset: `asset:${assetId}` } : {}),
        ...(url ? { url } : {}),
        layer: index,
        role,
        media_type: mediaType,
      };
    }));
    const nonEmpty = resolved.filter(
      (entry): entry is { asset?: string; url?: string; layer: number; role: string; media_type?: string } => !!entry,
    );
    return nonEmpty.length > 0 ? nonEmpty : undefined;
  };

  const queuedImageCompositionAssets = await resolveCompositionAssetsFromInputs(operationInputs, { mediaType: 'image' });
  const queuedVideoCompositionAssets = await resolveCompositionAssetsFromInputs(operationInputs, { mediaType: 'video' });

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
      ? operationInputs
        .map((item) => asPositiveAssetId(item.asset.id))
        .filter((id): id is number => !!id)
      : undefined;
    const hasQueuedCompositionAssets = !!(queuedImageCompositionAssets && queuedImageCompositionAssets.length > 0);

    let resolvedSourceIds = paramsSourceIds ?? (inputSourceIds && inputSourceIds.length > 0 ? inputSourceIds : undefined);

    if (!resolvedSourceIds && !explicitCompositionAssets) {
      const fallbackId = resolveSingleSourceAssetId();
      if (fallbackId) {
        resolvedSourceIds = [fallbackId];
      }
    }

    const hasAnyAsset = !!(resolvedSourceIds || explicitCompositionAssets || hasQueuedCompositionAssets);

    if (!hasAnyAsset && !trimmedPrompt) {
      // No asset AND no prompt - can't do image_to_image or text_to_image
      return {
        error: 'No image selected. Select an image or enter a prompt for text-to-image.',
        finalPrompt: trimmedPrompt,
      };
    }

    if (hasAnyAsset && !trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing how to transform the image.',
        finalPrompt: trimmedPrompt,
      };
    }

    // No asset + has prompt -> will fall back to text_to_image via getFallbackOperation

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
      ? operationInputs
        .map((item) => asPositiveAssetId(item.asset.id))
        .filter((id): id is number => !!id)
      : undefined;
    const hasQueuedCompositionAssets = !!(queuedImageCompositionAssets && queuedImageCompositionAssets.length > 0);

    let resolvedSourceIds = paramsSourceIds ?? (inputSourceIds && inputSourceIds.length > 0 ? inputSourceIds : undefined);

    if (!resolvedSourceIds && !explicitCompositionAssets) {
      // allowVideo: true - input slot can have video
      // allowVideoFallback: false - don't fallback to a video from gallery
      const fallbackId = resolveSingleSourceAssetId({ allowVideo: true, allowVideoFallback: false });
      if (fallbackId) {
        resolvedSourceIds = [fallbackId];
      }
    }

    if (!resolvedSourceIds && !explicitCompositionAssets && !hasQueuedCompositionAssets) {
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
    const explicitCompositionAssets =
      Array.isArray(dynamicParams.composition_assets) && dynamicParams.composition_assets.length > 0
        ? dynamicParams.composition_assets
        : undefined;
    const hasQueuedCompositionAssets = !!(queuedImageCompositionAssets && queuedImageCompositionAssets.length > 0);
    // allowVideo: true - input slot can have video (for frame extraction)
    // allowVideoFallback: false - don't fallback to a video from gallery selection
    const sourceAssetId = explicitCompositionAssets
      ? undefined
      : resolveSingleSourceAssetId({ allowVideo: true, allowVideoFallback: false });

    if ((explicitCompositionAssets || sourceAssetId || hasQueuedCompositionAssets) && !trimmedPrompt) {
      return {
        error: 'Please enter a prompt describing the motion/action for Image to Video.',
        finalPrompt: trimmedPrompt,
      };
    }

    // Always use resolved sourceAssetId - currentInput takes precedence over stale dynamicParams
    if (sourceAssetId) {
      inferredSourceAssetId = sourceAssetId;
    }
  }

  if (operationType === 'video_extend' || operationType === 'video_modify') {
    const explicitCompositionAssets =
      Array.isArray(dynamicParams.composition_assets) && dynamicParams.composition_assets.length > 0
        ? dynamicParams.composition_assets
        : undefined;
    const hasQueuedCompositionAssets = !!(queuedVideoCompositionAssets && queuedVideoCompositionAssets.length > 0);
    // Video-only: reject images, accept videos from input and fallback
    const sourceAssetId = explicitCompositionAssets
      ? undefined
      : resolveSingleSourceAssetId({ allowVideo: true, allowImage: false, allowVideoFallback: true });

    if (!sourceAssetId && !explicitCompositionAssets && !hasQueuedCompositionAssets) {
      const label = OPERATION_METADATA[operationType].label;
      return {
        error: `No video selected. Click "${label}" on a gallery video to use it.`,
        finalPrompt: trimmedPrompt,
      };
    }

    // Always use resolved sourceAssetId - currentInput takes precedence over stale dynamicParams
    if (sourceAssetId) {
      inferredSourceAssetId = sourceAssetId;
    }
  }

  let transitionDurations: number[] | undefined;
  if (operationType === 'video_transition') {
    const explicitCompositionAssets =
      Array.isArray(dynamicParams.composition_assets) && dynamicParams.composition_assets.length > 0
        ? dynamicParams.composition_assets
        : undefined;
    const queuedTransitionCompositionAssets = queuedImageCompositionAssets;
    const transitionSourceIds = Array.isArray(dynamicParams.source_asset_ids) && dynamicParams.source_asset_ids.length > 0
      ? dynamicParams.source_asset_ids
      : operationInputs
        .map((item) => asPositiveAssetId(item.asset.id))
        .filter((id): id is number => !!id);
    const assetCount =
      explicitCompositionAssets?.length
      ?? queuedTransitionCompositionAssets?.length
      ?? transitionSourceIds.length;
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

    if (
      !explicitCompositionAssets
      && !queuedTransitionCompositionAssets
      && !dynamicParams.source_asset_ids
      && transitionSourceIds.length
    ) {
      inferredSourceAssetIds = transitionSourceIds;
    }
  }

  // Clamp to provider/model limit (with headroom) before sending to API.
  const promptClampLimit = resolvePromptClampLimit(maxChars);
  const clampedPrompt = promptClampLimit != null
    ? trimmedPrompt.slice(0, promptClampLimit)
    : trimmedPrompt;

  const params: Record<string, any> = {
    ...dynamicParams,
    // Always enforce the clamped prompt at payload level.
    prompt: clampedPrompt,
  };

  // Per-asset mask: prefer maskLayers, fall back to legacy maskUrl
  if (currentInput?.maskLayers && currentInput.maskLayers.length > 0) {
    const normalizedLayers = currentInput.maskLayers
      .map((layer: any) => ({
        layer,
        assetUrl: resolveMaskLayerAssetUrl(layer),
      }))
      .filter(
        (entry): entry is { layer: any; assetUrl: string } =>
          typeof entry.assetUrl === 'string' && entry.assetUrl.length > 0,
      );
    const visibleLayers = normalizedLayers.filter((entry) => isMaskLayerVisible(entry.layer));
    const activeLayers = visibleLayers.length > 0 ? visibleLayers : normalizedLayers;

    if (activeLayers.length === 1) {
      // Single visible layer - use its asset URL directly (no compositing needed)
      params.mask_url = activeLayers[0].assetUrl;
    } else if (activeLayers.length > 1) {
      // Multiple visible layers - composite mask_url is set by the mask overlay on save.
      // At this point the composite should already be stored as the first layer's savedAssetId
      // or via the global mask_url param. Fall through to let dynamicParams.mask_url handle it.
      if (!params.mask_url) {
        // Safety fallback: if no composite exists yet, send the first visible layer.
        params.mask_url = activeLayers[0].assetUrl;
      }
    }
  } else if (currentInput?.maskUrl) {
    params.mask_url = currentInput.maskUrl;
  }

  if (inferredSourceAssetId) {
    params.source_asset_id = inferredSourceAssetId;
  }

  if (inferredSourceAssetIds) {
    params.source_asset_ids = inferredSourceAssetIds;
  }

  // Helper to extract source IDs from params for composition_assets fallback
  const extractSourceIds = (): number[] => {
    if (Array.isArray(params.source_asset_ids)) return params.source_asset_ids;
    if (params.source_asset_id) return [params.source_asset_id];
    return [];
  };

  if (operationType === 'image_to_image') {
    const inputCompositionAssets = queuedImageCompositionAssets;
    if (inputCompositionAssets) {
      params.composition_assets = inputCompositionAssets;
    } else if (!params.composition_assets) {
      params.composition_assets = buildCompositionAssetsFromAssetIds('image_to_image', extractSourceIds());
    }
  }

  // --- Composition assets assembly ---
  // Special cases first (fusion has role stripping, transition has multi-prompt)
  if (operationType === 'fusion') {
    const fusionHasRoles = operationInputs.some((item) => !!item.roleOverride);

    const inputCompositionAssets = queuedImageCompositionAssets;
    if (inputCompositionAssets) {
      params.composition_assets = inputCompositionAssets;
    } else if (!params.composition_assets) {
      params.composition_assets = buildCompositionAssetsFromAssetIds('fusion', extractSourceIds());
    }

    // Simple mode: strip roles so backend/SDK use flat @1/@2 references
    if (!fusionHasRoles && Array.isArray(params.composition_assets)) {
      params.composition_assets = params.composition_assets.map((entry: any) => {
        if (!entry || typeof entry !== 'object') {
          return entry;
        }
        const next = { ...entry };
        delete next.role;
        return next;
      });
    }
  } else if (operationType === 'video_transition') {
    if (!params.composition_assets) {
      if (queuedImageCompositionAssets && queuedImageCompositionAssets.length > 0) {
        params.composition_assets = queuedImageCompositionAssets.map((entry) => ({
          ...entry,
          role: 'transition_input',
        }));
      } else {
        params.composition_assets = buildCompositionAssetsFromAssetIds('video_transition', extractSourceIds());
      }
    }
    params.prompts = prompts.map((s) => s.trim()).filter(Boolean);
    if (transitionDurations && transitionDurations.length) {
      params.durations = transitionDurations;
    }
  } else {
    // Generic path: use metadata-driven role and media type
    const meta = OPERATION_METADATA[operationType];
    if (meta?.compositionRole && !params.composition_assets) {
      const queued = meta.inputMediaType === 'video'
        ? queuedVideoCompositionAssets
        : queuedImageCompositionAssets;
      if (queued && queued.length > 0) {
        params.composition_assets = queued.map((entry) => ({
          ...entry,
          role: meta.compositionRole!,
        }));
      } else {
        params.composition_assets = buildCompositionAssetsFromAssetIds(operationType, extractSourceIds());
      }
    }
  }

  if (params.composition_assets) {
    delete params.image_url;
    delete params.image_urls;
    delete params.video_url;
  }

  delete params.source_asset_id;
  delete params.source_asset_ids;

  const normalizedParams = normalizeProviderParams(params);

  return {
    params: normalizedParams,
    finalPrompt: clampedPrompt,
    pickStateUpdates: pickStateUpdates.length > 0 ? pickStateUpdates : undefined,
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
