/**
 * useLocalFoldersController
 *
 * Controller hook for local folders that separates business logic from UI.
 * Manages folder state, asset filtering, previews, uploads, and viewer navigation.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  generateThumbnail,
  type LocalAsset,
} from '../stores/localFoldersStore';
import { useAuthStore } from '@/stores/authStore';
import { computeFileSha256 } from '@/lib/utils';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useViewer } from '@/hooks/useViewer';
import type { LocalFoldersController, SourceInfo, ViewMode } from '../types/localSources';

const LOCAL_SOURCE: SourceInfo = {
  id: 'local-fs',
  label: 'Local Folders',
  type: 'local',
};

export function useLocalFoldersController(): LocalFoldersController {
  // Wire up localFoldersStore
  const {
    supported,
    folders: rawFolders,
    assets: assetsRecord,
    loadPersisted,
    addFolder,
    removeFolder,
    refreshFolder,
    adding,
    scanning,
    error,
    getFileForAsset,
    updateAssetHash,
    getUploadRecordByHash,
    setUploadRecordByHash,
    updateAssetUploadStatus,
  } = useLocalFolders();
  const userId = useAuthStore((state) => state.user?.id);

  // View state (persisted)
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    'ps7_localFolders_viewMode',
    'tree',
  );
  const [selectedFolderPath, setSelectedFolderPath] = usePersistentState<string | null>(
    'ps7_localFolders_selectedFolderPath',
    null,
  );

  // Preview state
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const loadingPreviewsRef = useRef<Set<string>>(new Set());

  // Track blob URLs for cleanup when they're no longer needed
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  // Upload state (persisted provider)
  const [providerId, setProviderId] = usePersistentState<string | undefined>(
    'ps7_localFolders_providerId',
    undefined,
    {
      serializer: (value) => JSON.stringify(value ?? null),
      deserializer: (str) => {
        const parsed = JSON.parse(str);
        return (parsed ?? undefined) as string | undefined;
      },
    },
  );
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({});
  const [uploadNotes, setUploadNotes] = useState<Record<string, string | undefined>>({});

  // Load persisted folders on mount
  useEffect(() => {
    loadPersisted();
  }, [loadPersisted, userId]);

  // Task 104: Initialize upload status from cached assets
  useEffect(() => {
    const initialStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'> = {};
    const initialNotes: Record<string, string | undefined> = {};

    for (const asset of Object.values(assetsRecord)) {
      if (asset.lastUploadStatus) {
        initialStatus[asset.key] = asset.lastUploadStatus;
        if (asset.lastUploadNote) {
          initialNotes[asset.key] = asset.lastUploadNote;
        }
      }
    }

    if (Object.keys(initialStatus).length > 0) {
      setUploadStatus(initialStatus);
      setUploadNotes(initialNotes);
    }
  }, [assetsRecord]);

  // Compute sorted asset list
  const assetList = useMemo(() => {
    const list = Object.values(assetsRecord);
    return list.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
  }, [assetsRecord]);

  // Filter assets by selected folder path in tree mode
  const filteredAssets = useMemo(() => {
    if (viewMode !== 'tree' || !selectedFolderPath) return assetList;

    return assetList.filter(asset => {
      // Root folder selected: path is just folderId
      if (selectedFolderPath === asset.folderId) {
        // Only show files directly under the root folder here.
        // Files inside subfolders are shown when those subfolders are selected
        // in the tree, to avoid rendering thousands of items at once.
        return !asset.relativePath.includes('/');
      }

      // For subfolders, ensure this asset belongs to the same root folder
      if (!selectedFolderPath.startsWith(asset.folderId + '/')) {
        return false;
      }

      // Compute the selected folder path relative to the root folder
      const selectedRelPath = selectedFolderPath.slice(asset.folderId.length + 1);
      const assetDir = asset.relativePath.includes('/')
        ? asset.relativePath.split('/').slice(0, -1).join('/')
        : '';

      // Only include files whose immediate parent folder matches the selected folder
      return assetDir === selectedRelPath;
    });
  }, [assetList, selectedFolderPath, viewMode]);

  // Viewer items list (depends on view mode)
  const viewerItems = useMemo(() => {
    return viewMode === 'tree' && selectedFolderPath ? filteredAssets : assetList;
  }, [viewMode, selectedFolderPath, filteredAssets, assetList]);

  // Load preview for an asset
  const loadPreview = useCallback(async (keyOrAsset: string | LocalAsset) => {
    const asset = typeof keyOrAsset === 'string' ? assetsRecord[keyOrAsset] : keyOrAsset;
    if (!asset) return;

    // Check if already loaded or currently loading
    if (previews[asset.key] || loadingPreviewsRef.current.has(asset.key)) return;

    // Mark as loading
    loadingPreviewsRef.current.add(asset.key);

    // Try cached thumbnail blob first (persisted in IndexedDB)
    let url: string | undefined;
    try {
      const cached = await getLocalThumbnailBlob(asset);
      if (cached) {
        url = URL.createObjectURL(cached);
      }
    } catch {
      // ignore cache errors and fall back to direct file read
    }

    // If no cached thumbnail, create from file and store
    if (!url) {
      try {
        const file = await getFileForAsset(asset);
        if (!file) {
          loadingPreviewsRef.current.delete(asset.key);
          return;
        }

        if (crypto.subtle) {
          try {
            let sha256 = asset.sha256;
            const needsHash = !sha256
              || asset.sha256_file_size !== file.size
              || asset.sha256_last_modified !== file.lastModified;
            if (needsHash) {
              sha256 = await computeFileSha256(file);
              await updateAssetHash(asset.key, sha256, file);
            }
            if (sha256 && asset.lastUploadStatus !== 'success') {
              const record = await getUploadRecordByHash(sha256);
              if (record?.status === 'success') {
                await updateAssetUploadStatus(asset.key, 'success', record.note);
              }
            }
          } catch (hashError) {
            console.warn('Failed to compute hash for local asset', asset.name, hashError);
          }
        }

        // Generate a smaller thumbnail for images and videos (much faster to render)
        const thumbnail = await generateThumbnail(file);
        if (thumbnail) {
          url = URL.createObjectURL(thumbnail);
          // Cache the smaller thumbnail for future sessions
          void setLocalThumbnailBlob(asset, thumbnail);
        } else {
          // Skip preview if thumbnail generation fails - don't load full file to avoid memory issues
          console.warn('Failed to generate thumbnail for', asset.name);
          loadingPreviewsRef.current.delete(asset.key);
          return;
        }
      } catch {
        loadingPreviewsRef.current.delete(asset.key);
        return;
      }
    }

    if (url) {
      // Track the blob URL for later cleanup
      blobUrlsRef.current.set(asset.key, url);
      setPreviews(p => ({ ...p, [asset.key]: url }));
    }
    loadingPreviewsRef.current.delete(asset.key);
  }, [assetsRecord, previews, getFileForAsset]);

  // Revoke blob URLs for assets that are no longer visible (called by UI)
  const revokePreview = useCallback((assetKey: string) => {
    const url = blobUrlsRef.current.get(assetKey);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrlsRef.current.delete(assetKey);
      setPreviews(p => {
        const next = { ...p };
        delete next[assetKey];
        return next;
      });
    }
  }, []);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current.clear();
    };
  }, []);

  // Viewer state with navigation
  const {
    viewerItem: viewerAsset,
    openViewer: openViewerBase,
    closeViewer,
    navigateViewer: navigateViewerBase,
  } = useViewer<LocalAsset>({
    items: viewerItems,
    getKey: (asset) => asset.key,
    onOpen: loadPreview,
  });

  // Wrap openViewer to ensure preview is loaded
  const openViewer = useCallback(async (asset: LocalAsset) => {
    await loadPreview(asset);
    await openViewerBase(asset);
  }, [loadPreview, openViewerBase]);

  // Wrap navigateViewer to load preview
  const navigateViewer = useCallback((direction: 'prev' | 'next') => {
    navigateViewerBase(direction);
    // Load preview after navigation (viewerAsset will be updated by hook)
  }, [navigateViewerBase]);

  // Upload one asset
  const uploadOne = async (keyOrAsset: string | LocalAsset) => {
    const asset = typeof keyOrAsset === 'string' ? assetsRecord[keyOrAsset] : keyOrAsset;
    if (!asset) return;
    if (!providerId) {
      alert('Select a provider');
      return;
    }

    setUploadStatus(s => ({ ...s, [asset.key]: 'uploading' }));

    try {
      const file = await getFileForAsset(asset);
      if (!file) throw new Error('Unable to read local file');
      let sha256: string | undefined;
      if (crypto.subtle) {
        try {
          sha256 = asset.sha256;
          const needsHash = !sha256
            || asset.sha256_file_size !== file.size
            || asset.sha256_last_modified !== file.lastModified;
          if (needsHash) {
            sha256 = await computeFileSha256(file);
            await updateAssetHash(asset.key, sha256, file);
          }
        } catch (hashError) {
          console.warn('Failed to compute hash before upload', asset.name, hashError);
        }
      }
      const form = new FormData();
      form.append('file', file, asset.name);
      form.append('provider_id', providerId);
      // Add source context for upload tracking
      if (asset.folderId) {
        form.append('source_folder_id', asset.folderId);
      }
      if (asset.relativePath) {
        form.append('source_relative_path', asset.relativePath);
      }
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

      // Get auth token from localStorage
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/upload`, {
        method: 'POST',
        body: form,
        headers,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }

      const data = await res.json().catch(() => ({}));
      const note = data?.note;

      setUploadNotes(n => ({ ...n, [asset.key]: note }));
      setUploadStatus(s => ({ ...s, [asset.key]: 'success' }));

      if (sha256) {
        await setUploadRecordByHash(sha256, {
          status: 'success',
          note,
          provider_id: providerId,
          uploaded_at: Date.now(),
        });
      }

      // Task 104: Persist upload success to cache
      await updateAssetUploadStatus(asset.key, 'success', note);
    } catch (e: any) {
      const errorMsg = e?.message || 'Upload failed';

      setUploadStatus(s => ({ ...s, [asset.key]: 'error' }));
      setUploadNotes(n => ({ ...n, [asset.key]: errorMsg }));

      // Task 104: Persist upload failure to cache
      await updateAssetUploadStatus(asset.key, 'error', errorMsg);
    }
  };

  // Return controller interface
  return {
    source: LOCAL_SOURCE,
    folders: rawFolders.map(f => ({ id: f.id, name: f.name })),
    assets: assetList,
    filteredAssets,
    loadPersisted,
    addFolder,
    removeFolder,
    refreshFolder,
    viewMode,
    setViewMode,
    selectedFolderPath,
    setSelectedFolderPath,
    previews,
    loadPreview,
    revokePreview,
    viewerAsset,
    openViewer,
    closeViewer,
    navigateViewer,
    providerId,
    setProviderId,
    uploadStatus,
    uploadNotes,
    uploadOne,
    supported,
    adding,
    scanning,
    error: error ?? null,
  };
}
