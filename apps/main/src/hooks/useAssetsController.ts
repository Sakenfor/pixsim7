import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAssets, type AssetSummary, type AssetFilters } from './useAssets';
import { useAsset } from './useAsset';
import { useAssetPickerStore } from '../stores/assetPickerStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useMediaGenerationActions } from './useMediaGenerationActions';
import { deleteAsset, uploadAssetToProvider } from '../lib/api/assets';
import { BACKEND_BASE } from '../lib/api/client';
import { extractErrorMessage } from '../lib/api/errorHandling';

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
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
  } = useMediaGenerationActions();

  // Read initial filters from URL + sessionStorage
  const params = new URLSearchParams(window.location.search);
  const persisted = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    } catch {
      return {};
    }
  })();

  const initialFilters: AssetFilters = {
    q: params.get('q') || persisted.q || '',
    tag: params.get('tag') || persisted.tag || undefined,
    provider_id: params.get('provider_id') || persisted.provider_id || undefined,
    sort: (params.get('sort') as any) || persisted.sort || 'new',
    media_type: (params.get('media_type') as any) || persisted.media_type || undefined,
    provider_status: (params.get('provider_status') as any) || persisted.provider_status || undefined,
  };

  // Filters state
  const [filters, setFilters] = useState<AssetFilters>(initialFilters);

  // Scope state (All, Favorites, Mine, Recent)
  const [scope, setScope] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('scope') || 'all';
  });

  // Data loading
  const { items, loadMore, loading, error, hasMore, reset } = useAssets({ filters });

  // Viewer state
  const [viewerAsset, setViewerAsset] = useState<AssetSummary | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  // Detail panel state
  const [detailAssetId, setDetailAssetId] = useState<number | null>(null);
  const { asset: detailAsset, loading: detailLoading, error: detailError } = useAsset(detailAssetId);

  // Gallery tools: multi-select state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Update URL and sessionStorage when filters change
  const updateURL = useCallback((nextFilters: AssetFilters) => {
    const p = new URLSearchParams();
    if (nextFilters.q) p.set('q', nextFilters.q);
    if (nextFilters.tag) p.set('tag', nextFilters.tag);
    if (nextFilters.provider_id) p.set('provider_id', nextFilters.provider_id);
    if (nextFilters.sort) p.set('sort', nextFilters.sort);
    if (nextFilters.media_type) p.set('media_type', nextFilters.media_type);
    if (nextFilters.provider_status) p.set('provider_status', nextFilters.provider_status);
    const newUrl = `${window.location.pathname}?${p.toString()}`;
    window.history.replaceState({}, '', newUrl);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextFilters));
  }, []);

  // Set filters and persist to URL + sessionStorage
  const setAndPersistFilters = useCallback((partial: Partial<AssetFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      updateURL(next);
      return next;
    });
  }, [updateURL]);

  // Sync scope to URL when it changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (scope === 'all') {
      params.delete('scope');
    } else {
      params.set('scope', scope);
    }
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [scope]);

  // Handle scope change
  const handleScopeChange = useCallback((newScope: string) => {
    setScope(newScope);
  }, []);

  // Handle asset selection for picker mode
  const handleSelectAsset = useCallback((asset: AssetSummary) => {
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

  // Handle asset deletion
  const handleDeleteAsset = useCallback(async (asset: AssetSummary) => {
    const confirmed = window.confirm(`Delete ${asset.media_type} asset "${asset.id}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteAsset(asset.id);
      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(String(asset.id));
        return next;
      });
      if (viewerAsset?.id === asset.id) {
        setViewerAsset(null);
        setViewerSrc(null);
      }
      reset();
    } catch (err) {
      console.error('Failed to delete asset:', err);
      alert(extractErrorMessage(err, 'Failed to delete asset'));
    }
  }, [viewerAsset, reset]);

  // Handle re-upload for local or multi-provider assets (provider chosen by caller)
  const reuploadAsset = useCallback(
    async (asset: AssetSummary, providerId: string) => {
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

  // Viewer management
  const openInViewer = useCallback((asset: AssetSummary) => {
    setViewerAsset(asset);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerAsset(null);
    if (viewerSrc && viewerSrc.startsWith('blob:')) {
      URL.revokeObjectURL(viewerSrc);
    }
    setViewerSrc(null);
  }, [viewerSrc]);

  const navigateViewer = useCallback((direction: 'prev' | 'next') => {
    if (!viewerAsset) return;
    const index = items.findIndex((a) => a.id === viewerAsset.id);
    if (index === -1) return;
    const nextIndex = direction === 'prev' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setViewerAsset(items[nextIndex]);
  }, [viewerAsset, items]);

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

  // Gallery tools: toggle asset selection
  const toggleAssetSelection = useCallback((assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  // Clear all selected assets
  const clearSelection = useCallback(() => {
    setSelectedAssetIds(new Set());
  }, []);

  // Get per-asset actions
  const getAssetActions = useCallback((asset: AssetSummary) => {
    return {
      onOpenDetails: (id: number) => setDetailAssetId(id),
      onShowMetadata: (id: number) => setDetailAssetId(id),
      onImageToVideo: () => queueImageToVideo(asset),
      onVideoExtend: () => queueVideoExtend(asset),
      onAddToTransition: () => queueAddToTransition(asset),
      onAddToGenerate: () => queueAutoGenerate(asset),
      onDelete: () => handleDeleteAsset(asset),
    };
  }, [
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    handleDeleteAsset,
  ]);

  return {
    // Filters
    filters,
    setFilters: setAndPersistFilters,

    // Scope
    scope,
    setScope: handleScopeChange,

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
