import { createAssetActions } from '@pixsim7/shared.assets.core';
import { useToast } from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo, useCallback } from 'react';

import type { AssetSearchRequest } from '@lib/api/assets';
import { BACKEND_BASE } from '@lib/api/client';
import { getGeneration } from '@lib/api/generations';
import { authService } from '@lib/auth';
import { resolveBackendUrl } from '@lib/media/backendUrl';

import { useMediaGenerationActions } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { createGenerationRunDescriptor, createGenerationRunItemContext } from '@features/generation/lib/runContext';
import { nextRandomGenerationSeed } from '@features/generation/lib/seed';
import { providerCapabilityRegistry } from '@features/providers';
import { useWorkspaceStore } from '@features/workspace';

import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { useViewer } from '@/hooks/useViewer';
import type { OperationType } from '@/types/operations';

import { deleteAsset, bulkDeleteAssets, uploadAssetToProvider, archiveAsset } from '../lib/api';
import { assetEvents } from '../lib/assetEvents';
import { extractUploadError } from '../lib/uploadActions';
import { getAssetDisplayUrls, toSelectedAsset } from '../models/asset';
import { useAssetDetailStore } from '../stores/assetDetailStore';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useAssetSelectionStore } from '../stores/assetSelectionStore';
import { useDeleteModalStore } from '../stores/deleteModalStore';

import { useAsset } from './useAsset';
import { useAssets, type AssetModel } from './useAssets';


const SESSION_KEY = 'assets_filters';

function stripSeedFromValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSeedFromValue(entry));
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (key === 'seed') {
        return;
      }
      next[key] = stripSeedFromValue(entry);
    });
    return next;
  }
  return value;
}

function stripSeedFromParams(params: Record<string, unknown>): Record<string, unknown> {
  const stripped = stripSeedFromValue(params);
  if (!stripped || typeof stripped !== 'object' || Array.isArray(stripped)) {
    return {};
  }
  return stripped as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeGenerationParamsCandidate(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return {};

  const generationConfig = asRecord(record.generation_config ?? record.generationConfig) ?? {};
  const root: Record<string, unknown> = {};

  Object.entries(record).forEach(([key, entry]) => {
    if (key === 'generation_config' || key === 'generationConfig') {
      return;
    }
    root[key] = entry;
  });

  // Back-compat for older records that only stored request fields under generation_config.
  return {
    ...generationConfig,
    ...root,
  };
}

function pickGenerationParams(original: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    (original as any).canonical_params,
    (original as any).canonicalParams,
    (original as any).raw_params,
    (original as any).rawParams,
    (original as any).params,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeGenerationParamsCandidate(candidate);
    if (Object.keys(normalized).length > 0) {
      return normalized;
    }
  }

  return {};
}

function paramsIncludeSeed(params: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(params, 'seed');
}

async function operationSupportsSeedParam(
  providerId: string | undefined,
  operationType: OperationType,
): Promise<boolean> {
  if (!providerId) return false;

  try {
    await providerCapabilityRegistry.fetchCapabilities();
  } catch {
    // Best effort. If fetch fails, fall back to currently cached specs.
  }

  const spec = providerCapabilityRegistry.getOperationSpec(providerId, operationType);
  const parameters = Array.isArray((spec as { parameters?: Array<{ name?: string }> } | null)?.parameters)
    ? (spec as { parameters?: Array<{ name?: string }> }).parameters!
    : [];

  return parameters.some((param) => param?.name === 'seed');
}

/**
 * Hook: useAssetsController
 *
 * Centralizes all business logic for the assets route and gallery surfaces.
 * Handles filter management, data loading, selection modes, viewer state, and per-asset actions.
 *
 * This allows the AssetsRoute component to be mostly declarative,
 * wiring UI elements to controller state/actions.
 */
export function useAssetsController(options?: { initialPage?: number; preservePageOnFilterChange?: boolean; requestOverrides?: Partial<AssetSearchRequest> }) {
  const toast = useToast();

  // Asset picker mode from store
  const isSelectionMode = useAssetPickerStore((s) => s.isSelectionMode);
  const selectAsset = useAssetPickerStore((s) => s.selectAsset);
  const exitSelectionMode = useAssetPickerStore((s) => s.exitSelectionMode);
  const closeFloatingPanel = useWorkspaceStore((s) => s.closeFloatingPanel);

  // Media generation actions
  const {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    quickGenerate,
    upgradeModel,
    patchAsset,
  } = useMediaGenerationActions();

  // Filter persistence
  const { filters, setFilters, replaceFilters } = useFilterPersistence({
    sessionKey: SESSION_KEY,
    initialFilters: {
      q: '',
      tag: undefined,
      provider_id: undefined,
      sort: 'new' as const,
      media_type: undefined,
      provider_status: undefined,
      upload_method: undefined,
      include_archived: undefined,
    },
    arrayKeys: ['media_type', 'provider_id', 'operation_type', 'upload_method', 'tag', 'content_elements', 'style_tags'],
    allowUnknownKeys: true,
    excludeUrlKeys: ['page', 'source', 'surface', 'group_by', 'group_view', 'group_scope', 'group_key', 'group_path', 'group_page'],
    syncToSession: true,
    readFromSession: true,
    sessionFallbackOnlyWhenNoQuery: true,
  });

  // Data loading with page-based pagination support
  const {
    items,
    loadMore,
    loading,
    error,
    hasMore,
    reset,
    removeAsset,
    currentPage,
    totalPages,
    goToPage,
    pageSize,
  } = useAssets({
    filters,
    limit: 50,
    initialPage: options?.initialPage,
    preservePageOnFilterChange: options?.preservePageOnFilterChange,
    requestOverrides: options?.requestOverrides,
  });

  // Viewer state
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const {
    viewerItem: viewerAsset,
    openViewer: openInViewer,
    closeViewer: closeViewerInternal,
    navigateViewer
  } = useViewer({ items });

  // Detail panel state (shared via store)
  const detailAssetId = useAssetDetailStore((s) => s.detailAssetId);
  const setDetailAssetId = useAssetDetailStore((s) => s.setDetailAssetId);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

  // Multi-select state (global store)
  const selectedAssets = useAssetSelectionStore((s) => s.selectedAssets);
  const toggleAsset = useAssetSelectionStore((s) => s.toggleAsset);
  const clearSelection = useAssetSelectionStore((s) => s.clearSelection);
  const storeSelectAll = useAssetSelectionStore((s) => s.selectAll);
  const storeRemoveAsset = useAssetSelectionStore((s) => s.removeAsset);

  const selectedAssetIds = useMemo(
    () => new Set(selectedAssets.map((a) => String(a.id))),
    [selectedAssets],
  );

  const toggleAssetSelection = useCallback(
    (asset: AssetModel) => {
      toggleAsset(toSelectedAsset(asset, 'gallery'));
    },
    [toggleAsset],
  );

  const selectAll = useCallback(
    (assets: AssetModel[]) => {
      storeSelectAll(assets.map((a) => toSelectedAsset(a, 'gallery')));
    },
    [storeSelectAll],
  );

  // Handle asset selection for picker mode
  const handleSelectAsset = useCallback((asset: AssetModel) => {
    const { mainUrl, thumbnailUrl } = getAssetDisplayUrls(asset);
    selectAsset({
      id: String(asset.id),
      mediaType: asset.mediaType,
      providerId: asset.providerId,
      providerAssetId: asset.providerAssetId,
      remoteUrl: mainUrl,
      thumbnailUrl,
    });
    // Close floating gallery panel
    closeFloatingPanel('gallery');
  }, [selectAsset, closeFloatingPanel]);

  // Handle cancel selection
  const handleCancelSelection = useCallback(() => {
    exitSelectionMode();
    closeFloatingPanel('gallery');
  }, [exitSelectionMode, closeFloatingPanel]);

  // Wrap closeViewer to handle blob cleanup
  const closeViewer = useCallback(async () => {
    await closeViewerInternal();
    if (viewerSrc && viewerSrc.startsWith('blob:')) {
      URL.revokeObjectURL(viewerSrc);
    }
    setViewerSrc(null);
  }, [closeViewerInternal, viewerSrc]);

  // Delete modal state (shared store)
  const deleteModalAssets = useDeleteModalStore((s) => s.assets);
  const deleteModalAsset = useDeleteModalStore((s) => s.asset);
  const openDeleteModal = useDeleteModalStore((s) => s.openDeleteModal);
  const closeDeleteModal = useDeleteModalStore((s) => s.closeDeleteModal);

  // Handle asset deletion - opens modal
  const handleDeleteAsset = useCallback((asset: AssetModel) => {
    openDeleteModal(asset);
  }, [openDeleteModal]);

  // Confirm deletion from modal (single or batch)
  const confirmDeleteAsset = useCallback(async (deleteFromProvider: boolean) => {
    const assets = deleteModalAssets;
    if (!assets.length) return;

    closeDeleteModal();

    try {
      if (assets.length === 1) {
        await deleteAsset(assets[0].id, { delete_from_provider: deleteFromProvider });
      } else {
        await bulkDeleteAssets(
          assets.map((a) => a.id),
          { delete_from_provider: deleteFromProvider },
        );
      }

      // Emit delete events and clean up selection/viewer for each asset
      for (const asset of assets) {
        assetEvents.emitAssetDeleted(asset.id);
        storeRemoveAsset(asset.id);
      }
      // Close viewer if viewing a deleted asset
      if (viewerAsset && assets.some((a) => a.id === viewerAsset.id)) {
        await closeViewer();
      }
    } catch (err) {
      console.error('Failed to delete asset(s):', err);
      toast.error(extractUploadError(err, 'Failed to delete asset(s)'));
    }
  }, [deleteModalAssets, closeDeleteModal, viewerAsset, storeRemoveAsset, closeViewer, toast]);

  // Cancel deletion
  const cancelDeleteAsset = useCallback(() => {
    closeDeleteModal();
  }, [closeDeleteModal]);

  // Handle asset archiving
  const handleArchiveAsset = useCallback(async (asset: AssetModel) => {
    try {
      await archiveAsset(asset.id, true);
      // Remove archived asset from view without resetting scroll position
      removeAsset(asset.id);
    } catch (err) {
      console.error('Failed to archive asset:', err);
      toast.error(extractUploadError(err, 'Failed to archive asset'));
    }
  }, [removeAsset, toast]);

  // Handle re-upload for local or multi-provider assets (provider chosen by caller)
  const reuploadAsset = useCallback(
    async (asset: AssetModel, providerId: string) => {
      if (!providerId) {
        toast.error('No provider selected for re-upload.');
        return;
      }
      try {
        await uploadAssetToProvider(asset.id, providerId);
        reset();
      } catch (err) {
        console.error('Failed to re-upload asset:', err);
        toast.error(extractUploadError(err, 'Failed to re-upload asset'));
      }
    },
    [reset, toast],
  );

  // Handle regenerate - re-run the generation that created an asset
  const handleRegenerateAsset = useCallback(async (generationId: number) => {
    try {
      // Fetch the original generation
      const original = await getGeneration(generationId);
      const sourceParams = pickGenerationParams(original as unknown as Record<string, unknown>);
      const cleanedParams = stripSeedFromParams(sourceParams);

      const shouldRandomizeSeed =
        paramsIncludeSeed(sourceParams)
        || await operationSupportsSeedParam(
          original.provider_id,
          original.operation_type as OperationType,
        );
      if (shouldRandomizeSeed) {
        cleanedParams.seed = nextRandomGenerationSeed();
      }

      const promptFromParams = typeof cleanedParams.prompt === 'string' ? cleanedParams.prompt : '';
      const prompt = (original.final_prompt && original.final_prompt.trim() !== '')
        ? original.final_prompt
        : promptFromParams;
      const run = createGenerationRunDescriptor({
        mode: 'asset_regenerate',
        metadata: {
          source: 'useAssetsController.handleRegenerateAsset',
          source_generation_id: generationId,
        },
      });

      await generateAsset({
        prompt,
        providerId: original.provider_id,
        operationType: original.operation_type as OperationType,
        extraParams: cleanedParams,
        runContext: createGenerationRunItemContext(run, {
          itemIndex: 0,
          itemTotal: 1,
        }),
      });

      // Refresh to show the new generation
      reset();
    } catch (err) {
      console.error('Failed to regenerate:', err);
      toast.error(extractUploadError(err, 'Failed to regenerate'));
    }
  }, [reset, toast]);

  // Load viewer media source (supports backend-relative URLs with auth)
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!viewerAsset) {
        if (viewerSrc && viewerSrc.startsWith('blob:')) {
          URL.revokeObjectURL(viewerSrc);
        }
        setViewerSrc(null);
        return;
      }

      const { mainUrl, previewUrl, thumbnailUrl } = getAssetDisplayUrls(viewerAsset);
      const candidate = mainUrl || previewUrl || thumbnailUrl;
      if (!candidate) {
        setViewerSrc(null);
        return;
      }

      // Blob/data/file URLs: use directly
      if (candidate.startsWith('blob:') || candidate.startsWith('data:') || candidate.startsWith('file://')) {
        setViewerSrc(candidate);
        return;
      }

      const { fullUrl, isBackend } = resolveBackendUrl(candidate, BACKEND_BASE);

      // External URL: use directly
      if (!isBackend) {
        setViewerSrc(fullUrl);
        return;
      }

      const token = authService.getStoredToken();
      if (!token) {
        setViewerSrc(fullUrl);
        return;
      }

      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setViewerSrc(fullUrl);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (!cancelled) {
          if (viewerSrc && viewerSrc.startsWith('blob:')) {
            URL.revokeObjectURL(viewerSrc);
          }
          setViewerSrc(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch {
        if (!cancelled) {
          setViewerSrc(fullUrl);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerAsset]);

  // Asset action handlers
  const actionHandlers = useMemo(() => ({
    onOpenDetails: setDetailAssetId,
    onImageToImage: queueImageToImage,
    onImageToVideo: queueImageToVideo,
    onVideoExtend: queueVideoExtend,
    onAddToTransition: queueAddToTransition,
    onAddToGenerate: queueAutoGenerate,
    onQuickAdd: quickGenerate,
    onRegenerateAsset: handleRegenerateAsset,
    onArchive: handleArchiveAsset,
    onDelete: handleDeleteAsset,
  }), [
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    quickGenerate,
    handleRegenerateAsset,
    handleArchiveAsset,
    handleDeleteAsset,
  ]);

  // Get per-asset actions
  const getAssetActions = useCallback((asset: AssetModel) => {
    const actions = createAssetActions(asset, actionHandlers);
    // Gesture system uses onQuickGenerate; shared action factory exposes onQuickAdd.
    // Alias here so default right-swipe quick-generate works in remote gallery.
    // Forward burst count and duration from gesture system for swipe-distance scaling.
    if (!actions.onQuickGenerate) {
      actions.onQuickGenerate = (_id?: number, count?: number, overrides?: { duration?: number }) =>
        quickGenerate(asset, { count, duration: overrides?.duration });
    }
    // Gesture cascade actions — bound to the asset at the controller level.
    actions.onUpgradeModel = () => upgradeModel(asset);
    actions.onPatchAsset = () => patchAsset(asset);
    return actions;
  }, [actionHandlers, quickGenerate, upgradeModel, patchAsset]);

  return {
    // Filters
    filters,
    setFilters,
    replaceFilters,

    // Data
    assets: items,
    loadMore,
    loading,
    error,
    hasMore,
    reset,

    // Page-based pagination
    currentPage,
    totalPages,
    goToPage,
    pageSize,

    // Selection mode (asset picker)
    isSelectionMode,
    selectAsset: handleSelectAsset,
    exitSelectionMode,
    cancelSelection: handleCancelSelection,

    // Gallery tools: multi-select
    selectedAssetIds,
    toggleAssetSelection,
    clearSelection,
    selectAll,

    // Viewer
    viewerAsset,
    viewerSrc,
    openInViewer,
    closeViewer,
    navigateViewer,

    // Detail panel
    detailAssetId,
    setDetailAssetId,
    detailAsset,
    detailLoading,
    detailError,

    // Per-asset actions
    getAssetActions,
    reuploadAsset,

    // Delete modal
    deleteModalAssets,
    deleteModalAsset,
    confirmDeleteAsset,
    cancelDeleteAsset,
  };
}

export type AssetsController = ReturnType<typeof useAssetsController>;
