import { createAssetActions } from '@pixsim7/shared.assets.core';
import { useState, useEffect, useMemo, useCallback } from 'react';

import type { AssetSearchRequest } from '@lib/api/assets';
import { BACKEND_BASE } from '@lib/api/client';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { getGeneration, createGeneration } from '@lib/api/generations';
import { authService } from '@lib/auth';
import { resolveBackendUrl } from '@lib/media/backendUrl';

import { useMediaGenerationActions } from '@features/generation';
import { useWorkspaceStore } from '@features/workspace';

import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { useSelection } from '@/hooks/useSelection';
import { useViewer } from '@/hooks/useViewer';

import { deleteAsset, uploadAssetToProvider, archiveAsset } from '../lib/api';
import { assetEvents } from '../lib/assetEvents';
import { getAssetDisplayUrls } from '../models/asset';
import { useAssetDetailStore } from '../stores/assetDetailStore';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useDeleteModalStore } from '../stores/deleteModalStore';

import { useAsset } from './useAsset';
import { useAssets, type AssetModel } from './useAssets';


const SESSION_KEY = 'assets_filters';

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
  } = useMediaGenerationActions();

  // Filter persistence
  const { filters, setFilters } = useFilterPersistence({
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
    arrayKeys: ['media_type', 'provider_id', 'upload_method', 'tag', 'analysis_tags'],
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

  // Multi-select state
  const { selectedIds: selectedAssetIds, toggleSelection: toggleAssetSelection, clearSelection, isSelected } = useSelection();

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
  const deleteModalAsset = useDeleteModalStore((s) => s.asset);
  const openDeleteModal = useDeleteModalStore((s) => s.openDeleteModal);
  const closeDeleteModal = useDeleteModalStore((s) => s.closeDeleteModal);

  // Handle asset deletion - opens modal
  const handleDeleteAsset = useCallback((asset: AssetModel) => {
    openDeleteModal(asset);
  }, [openDeleteModal]);

  // Confirm deletion from modal
  const confirmDeleteAsset = useCallback(async (deleteFromProvider: boolean) => {
    const asset = deleteModalAsset;
    if (!asset) return;

    closeDeleteModal();

    try {
      await deleteAsset(asset.id, { delete_from_provider: deleteFromProvider });

      // Emit delete event so all gallery instances update
      assetEvents.emitAssetDeleted(asset.id);

      // Remove from selection if selected
      if (isSelected(asset.id)) {
        toggleAssetSelection(String(asset.id));
      }
      // Close viewer if viewing this asset
      if (viewerAsset?.id === asset.id) {
        await closeViewer();
      }
    } catch (err) {
      console.error('Failed to delete asset:', err);
      alert(extractErrorMessage(err, 'Failed to delete asset'));
    }
  }, [deleteModalAsset, closeDeleteModal, viewerAsset, isSelected, toggleAssetSelection, closeViewer]);

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
      alert(extractErrorMessage(err, 'Failed to archive asset'));
    }
  }, [removeAsset]);

  // Handle re-upload for local or multi-provider assets (provider chosen by caller)
  const reuploadAsset = useCallback(
    async (asset: AssetModel, providerId: string) => {
      if (!providerId) {
        alert('No provider selected for re-upload.');
        return;
      }
      try {
        await uploadAssetToProvider(asset.id, providerId);
        reset();
      } catch (err) {
        console.error('Failed to re-upload asset:', err);
        alert(extractErrorMessage(err, 'Failed to re-upload asset'));
      }
    },
    [reset],
  );

  // Handle regenerate - re-run the generation that created an asset
  const handleRegenerateAsset = useCallback(async (generationId: number) => {
    try {
      // Fetch the original generation
      const original = await getGeneration(generationId);

      // Create a new generation with the same parameters
      await createGeneration({
        operation_type: original.operation_type,
        provider_id: original.provider_id,
        params: original.params,
        prompt: original.prompt,
        source_asset_ids: original.source_asset_ids,
      });

      // Refresh to show the new generation
      reset();
    } catch (err) {
      console.error('Failed to regenerate:', err);
      alert(extractErrorMessage(err, 'Failed to regenerate'));
    }
  }, [reset]);

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
    return createAssetActions(asset, actionHandlers);
  }, [actionHandlers]);

  return {
    // Filters
    filters,
    setFilters,

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
    deleteModalAsset,
    confirmDeleteAsset,
    cancelDeleteAsset,
  };
}
