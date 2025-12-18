import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAssets, type AssetFilters } from './useAssets';
import type { AssetResponse } from '@lib/api/assets';
import { useAsset } from './useAsset';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useWorkspaceStore } from '@features/workspace';
import { useMediaGenerationActions } from '@features/generation';
import { deleteAsset, uploadAssetToProvider, archiveAsset } from '../lib/api';
import { BACKEND_BASE } from '@lib/api/client';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { useFilterPersistence } from '@/hooks/useFilterPersistence';
import { useSelection } from '@/hooks/useSelection';
import { useViewer } from '@/hooks/useViewer';
import { createAssetActions } from '../lib/assetCardActions';

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
export function useAssetsController() {
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
    queueSilentAdd,
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
    },
  });

  // Data loading
  const { items, loadMore, loading, error, hasMore, reset } = useAssets({ filters });

  // Viewer state
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const {
    viewerItem: viewerAsset,
    openViewer: openInViewer,
    closeViewer: closeViewerInternal,
    navigateViewer
  } = useViewer({ items });

  // Detail panel state
  const [detailAssetId, setDetailAssetId] = useState<number | null>(null);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

  // Multi-select state
  const { selectedIds: selectedAssetIds, toggleSelection: toggleAssetSelection, clearSelection, isSelected } = useSelection();

  // Handle asset selection for picker mode
  const handleSelectAsset = useCallback((asset: AssetResponse) => {
    selectAsset({
      id: String(asset.id),
      mediaType: asset.media_type,
      providerId: asset.provider_id,
      providerAssetId: asset.provider_asset_id,
      remoteUrl: asset.remote_url,
      thumbnailUrl: asset.thumbnail_url,
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

  // Handle asset deletion
  const handleDeleteAsset = useCallback(async (asset: AssetResponse) => {
    const confirmed = window.confirm(`Delete ${asset.media_type} asset "${asset.id}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteAsset(asset.id);
      // Remove from selection if selected
      if (isSelected(asset.id)) {
        toggleAssetSelection(String(asset.id));
      }
      // Close viewer if viewing this asset
      if (viewerAsset?.id === asset.id) {
        await closeViewer();
      }
      reset();
    } catch (err) {
      console.error('Failed to delete asset:', err);
      alert(extractErrorMessage(err, 'Failed to delete asset'));
    }
  }, [viewerAsset, reset, isSelected, toggleAssetSelection, closeViewer]);

  // Handle asset archiving
  const handleArchiveAsset = useCallback(async (asset: AssetResponse) => {
    try {
      await archiveAsset(asset.id, true);
      // Refresh the list to remove archived asset from view
      reset();
    } catch (err) {
      console.error('Failed to archive asset:', err);
      alert(extractErrorMessage(err, 'Failed to archive asset'));
    }
  }, [reset]);

  // Handle re-upload for local or multi-provider assets (provider chosen by caller)
  const reuploadAsset = useCallback(
    async (asset: AssetResponse, providerId: string) => {
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

      const candidate = viewerAsset.remote_url || viewerAsset.thumbnail_url;
      if (!candidate) {
        setViewerSrc(null);
        return;
      }

      // Absolute URL or blob URL: use directly
      if (candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('blob:')) {
        setViewerSrc(candidate);
        return;
      }

      // Backend-relative path: fetch with Authorization and create blob URL
      const fullUrl = candidate.startsWith('/')
        ? `${BACKEND_BASE}${candidate}`
        : `${BACKEND_BASE}/${candidate}`;

      const token = localStorage.getItem('access_token');
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
    onQuickAdd: queueSilentAdd,
    onArchive: handleArchiveAsset,
    onDelete: handleDeleteAsset,
  }), [
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    queueSilentAdd,
    handleArchiveAsset,
    handleDeleteAsset,
  ]);

  // Get per-asset actions
  const getAssetActions = useCallback((asset: AssetResponse) => {
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
  };
}
