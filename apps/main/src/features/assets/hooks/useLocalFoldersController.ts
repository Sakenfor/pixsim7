/**
 * useLocalFoldersController
 *
 * Controller hook for local folders that separates business logic from UI.
 * Manages folder state, asset filtering, previews, uploads, and viewer navigation.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { uploadAsset } from '@lib/api/upload';

import { usePersistentState } from '@/hooks/usePersistentState';
import { useViewer } from '@/hooks/useViewer';
import { computeFileSha256 } from '@pixsim7/shared.helpers.core';
import { useAuthStore } from '@/stores/authStore';

import {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  generateThumbnail,
  type LocalAsset,
} from '../stores/localFoldersStore';
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

  // Track which folders have had SHA computed and checked against backend
  const hashCheckedFoldersRef = useRef<Map<string, string>>(new Map());
  const hashCheckInProgressRef = useRef<Set<string>>(new Set());

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

  // Load persisted folders on mount (only after auth is ready)
  useEffect(() => {
    // Don't load until we have a userId - prevents loading from wrong namespace
    // and then overwriting with empty state
    if (!userId) return;
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

  // Compute SHA and check against backend when folder is selected
  useEffect(() => {
    if (!selectedFolderPath || !crypto.subtle) return;

    if (filteredAssets.length === 0) return;

    const scopeKey = selectedFolderPath;
    const maxLastModified = filteredAssets.reduce(
      (max, asset) => Math.max(max, asset.lastModified ?? 0),
      0
    );
    const scopeSignature = `${filteredAssets.length}:${maxLastModified}`;

    // Skip if already checked or in progress for the same scope signature
    if (hashCheckInProgressRef.current.has(scopeKey)) return;
    if (hashCheckedFoldersRef.current.get(scopeKey) === scopeSignature) return;

    // Get assets that need hashing
    const assetsToHash = filteredAssets.filter(asset => {
      // Skip if already has valid hash
      if (asset.sha256 && asset.sha256_file_size === asset.size && asset.sha256_last_modified === asset.lastModified) {
        return false;
      }
      // Skip if already marked as success (uploaded)
      if (asset.lastUploadStatus === 'success') return false;
      return true;
    });

    // Also get assets that have hash but weren't checked yet
    const assetsWithHash = filteredAssets.filter(asset =>
      asset.sha256 &&
      asset.sha256_file_size === asset.size &&
      asset.sha256_last_modified === asset.lastModified &&
      asset.lastUploadStatus !== 'success'
    );

    // If nothing to do, mark as checked for this scope signature.
    if (assetsToHash.length === 0 && assetsWithHash.length === 0) {
      hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
      return;
    }

    // Mark as in progress
    hashCheckInProgressRef.current.add(scopeKey);

    // Background hash computation and check
    const computeAndCheck = async () => {
      try {
        const hashesWithKeys: { sha256: string; assetKey: string }[] = [];

        // Add existing hashes
        for (const asset of assetsWithHash) {
          if (asset.sha256) {
            hashesWithKeys.push({ sha256: asset.sha256, assetKey: asset.key });
          }
        }

        // Compute hashes for assets that need it (in chunks to avoid blocking UI)
        const CHUNK_SIZE = 5;
        for (let i = 0; i < assetsToHash.length; i += CHUNK_SIZE) {
          const chunk = assetsToHash.slice(i, i + CHUNK_SIZE);

          await Promise.all(chunk.map(async (asset) => {
            try {
              const file = await getFileForAsset(asset);
              if (!file) return;

              const sha256 = await computeFileSha256(file);
              await updateAssetHash(asset.key, sha256, file);
              hashesWithKeys.push({ sha256, assetKey: asset.key });
            } catch (e) {
              console.warn('Failed to hash asset:', asset.name, e);
            }
          }));

          // Yield to main thread between chunks
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Call batch API to check which hashes exist
        if (hashesWithKeys.length > 0) {
          const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
          const token = authService.getStoredToken();
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          try {
            const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/check-by-hash-batch`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ hashes: hashesWithKeys.map(h => h.sha256) }),
            });

            if (res.ok) {
              const data = await res.json();
              const foundHashes = new Set(
                (data.results || [])
                  .filter((r: { exists: boolean }) => r.exists)
                  .map((r: { sha256: string }) => r.sha256)
              );

              // Update status for assets that exist in system
              for (const { sha256, assetKey } of hashesWithKeys) {
                if (foundHashes.has(sha256)) {
                  await updateAssetUploadStatus(assetKey, 'success', 'Already in library');
                  setUploadStatus(s => ({ ...s, [assetKey]: 'success' }));
                  setUploadNotes(n => ({ ...n, [assetKey]: 'Already in library' }));
                }
              }
            }
          } catch (e) {
            console.warn('Failed to check hashes against backend:', e);
          }
        }
      } finally {
        hashCheckInProgressRef.current.delete(scopeKey);
        hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
      }
    };

    void computeAndCheck();
  }, [selectedFolderPath, filteredAssets, getFileForAsset, updateAssetHash, updateAssetUploadStatus]);

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
      const data = await uploadAsset({
        file,
        filename: asset.name,
        providerId,
        uploadMethod: 'local',
        uploadContext: { client: 'web_app', feature: 'local_folders' },
        sourceFolderId: asset.folderId,
        sourceRelativePath: asset.relativePath,
      });

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
