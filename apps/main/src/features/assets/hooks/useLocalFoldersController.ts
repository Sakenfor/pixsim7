/**
 * useLocalFoldersController
 *
 * Controller hook for local folders that separates business logic from UI.
 * Manages folder state, asset filtering, previews, uploads, and viewer navigation.
 */

import type { SourceIdentity } from '@pixsim7/shared.sources.core';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

import { uploadAsset } from '@lib/api/upload';

import { usePersistentState } from '@/hooks/usePersistentState';
import { useViewer } from '@/hooks/useViewer';
import { useAuthStore } from '@/stores/authStore';
import type { LocalFoldersController, SourceInfo, ViewMode } from '@/types/localSources';

import {
  checkHashesAgainstBackend,
  computeLocalAssetScopeSignature,
  computeStableSignature,
  ensureLocalAssetSha256,
  hasValidStoredHash,
} from '../lib/localHashing';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  generateThumbnail,
  type LocalAsset,
} from '../stores/localFoldersStore';

/** Placeholder folder that needs to be re-added */
export type MissingFolder = {
  name: string;
  isMissing: true;
};

/**
 * Source identity for local folders
 * Satisfies both SourceIdentity (new) and SourceInfo (legacy) interfaces
 */
const LOCAL_SOURCE: SourceIdentity & SourceInfo = {
  // SourceIdentity fields
  typeId: 'local-fs',
  instanceId: 'local-fs',
  label: 'Local Folders',
  kind: 'local',
  icon: 'folder',
  // Legacy SourceInfo fields (for backward compatibility)
  id: 'local-fs',
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
    loading,
    scanning,
    error,
    getFileForAsset,
    updateAssetHash,
    setUploadRecordByHash,
    updateAssetUploadStatus,
    missingFolderNames,
    dismissMissingFolders,
  } = useLocalFolders();
  const userId = useAuthStore((state) => state.user?.id);

  // Local folder settings
  const autoHashOnSelect = useLocalFolderSettingsStore((s) => s.autoHashOnSelect);
  const autoCheckBackend = useLocalFolderSettingsStore((s) => s.autoCheckBackend);
  const hashChunkSize = useLocalFolderSettingsStore((s) => s.hashChunkSize);
  const providerId = useLocalFolderSettingsStore((s) => s.providerId);
  const setProviderId = useLocalFolderSettingsStore((s) => s.setProviderId);

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

  // Track which selected folder scopes have completed local SHA computation
  const hashCheckedFoldersRef = useRef<Map<string, string>>(new Map());
  const backendHashCheckedRef = useRef<Set<string>>(new Set());
  const backendExistingHashesRef = useRef<Set<string>>(new Set());
  const backendHashCheckInProgressRef = useRef<Set<string>>(new Set());

  // Background hashing progress & controls
  const [hashingProgress, setHashingProgress] = useState<{ total: number; done: number } | null>(null);
  const bgHashRunIdRef = useRef(0);
  const bgHashPausedRef = useRef(false);
  const [hashingPaused, setHashingPaused] = useState(false);

  // Upload state
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({});
  const [uploadNotes, setUploadNotes] = useState<Record<string, string | undefined>>({});

  // Load persisted folders on mount (only after auth is ready)
  useEffect(() => {
    // Don't load until we have a userId - prevents loading from wrong namespace
    // and then overwriting with empty state
    console.info('[LocalFoldersController] Load effect:', { userId: userId ?? 'none' });
    if (!userId) return;
    loadPersisted();
  }, [loadPersisted, userId]);

  // Task 104: Initialize upload status from cached assets
  useEffect(() => {
    const initialStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'> = {};
    const initialNotes: Record<string, string | undefined> = {};

    for (const asset of Object.values(assetsRecord)) {
      if (asset.last_upload_status) {
        initialStatus[asset.key] = asset.last_upload_status;
        if (asset.last_upload_note) {
          initialNotes[asset.key] = asset.last_upload_note;
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

  // Compute SHA for selected folder scope when folder is selected.
  // Only hashes assets in the currently visible folder — not all assets globally.
  // Respects autoHashOnSelect setting; when disabled, hashing only happens on upload/preview.
  useEffect(() => {
    if (!autoHashOnSelect || !selectedFolderPath || !crypto.subtle) return;

    if (filteredAssets.length === 0) {
      setHashingProgress(null);
      return;
    }

    const scopeKey = selectedFolderPath;
    const scopeSignature = computeLocalAssetScopeSignature(filteredAssets);

    // Skip if already checked for the same scope signature
    if (hashCheckedFoldersRef.current.get(scopeKey) === scopeSignature) return;

    // Get assets that need hashing
    const assetsToHash = filteredAssets.filter(asset => {
      if (hasValidStoredHash(asset)) return false;
      if (asset.last_upload_status === 'success') return false;
      return true;
    });

    // If nothing to do, mark as checked for this scope signature.
    if (assetsToHash.length === 0) {
      hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
      setHashingProgress(null);
      return;
    }

    const runId = ++bgHashRunIdRef.current;
    bgHashPausedRef.current = false;
    setHashingPaused(false);
    setHashingProgress({ total: assetsToHash.length, done: 0 });

    const chunkSize = hashChunkSize;

    const computeHashes = async () => {
      let done = 0;

      try {
        for (let i = 0; i < assetsToHash.length; i += chunkSize) {
          if (bgHashRunIdRef.current !== runId) return;

          // Wait while paused
          while (bgHashPausedRef.current) {
            if (bgHashRunIdRef.current !== runId) return;
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          const chunk = assetsToHash.slice(i, i + chunkSize);

          for (const asset of chunk) {
            if (bgHashRunIdRef.current !== runId) return;
            try {
              const { getFileForAsset: getFile, updateAssetHash: updateHash } = useLocalFolders.getState();
              const file = await getFile(asset);
              if (!file) continue;
              await ensureLocalAssetSha256(asset, file, updateHash);
            } catch (e) {
              console.warn('Failed to hash asset:', asset.name, e);
            }
          }

          done += chunk.length;
          if (bgHashRunIdRef.current === runId) {
            setHashingProgress({ total: assetsToHash.length, done });
          }

          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } finally {
        if (bgHashRunIdRef.current === runId) {
          hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
          setHashingProgress(null);
        }
      }
    };

    void computeHashes();

    return () => { bgHashRunIdRef.current++; };
  }, [selectedFolderPath, filteredAssets, autoHashOnSelect, hashChunkSize]);

  // Global backend existence check for all hashed assets.
  // This decouples "already in library" detection from selected subfolder state.
  const backendHashCheckTrigger = useMemo(() => {
    const tokens: string[] = [];
    for (const asset of Object.values(assetsRecord)) {
      if (!hasValidStoredHash(asset)) continue;
      if (asset.last_upload_status === 'success') continue;
      if (!asset.sha256) continue;
      tokens.push(`${asset.key}|${asset.sha256}`);
    }
    return computeStableSignature(tokens);
  }, [assetsRecord]);

  useEffect(() => {
    if (!autoCheckBackend) return;

    const candidates = Object.values(assetsRecord).filter(asset => (
      hasValidStoredHash(asset) &&
      asset.last_upload_status !== 'success' &&
      !!asset.sha256
    ));
    if (candidates.length === 0) return;

    const hashToAssetKeys = new Map<string, string[]>();
    for (const asset of candidates) {
      const sha256 = asset.sha256!;
      const keys = hashToAssetKeys.get(sha256) || [];
      keys.push(asset.key);
      hashToAssetKeys.set(sha256, keys);
    }

    const syncKnownExisting = async () => {
      for (const [sha256, assetKeys] of hashToAssetKeys) {
        if (!backendExistingHashesRef.current.has(sha256)) continue;
        for (const assetKey of assetKeys) {
          await updateAssetUploadStatus(assetKey, 'success', 'Already in library');
          setUploadStatus(s => ({ ...s, [assetKey]: 'success' }));
          setUploadNotes(n => ({ ...n, [assetKey]: 'Already in library' }));
        }
      }
    };

    const checkRemaining = async () => {
      const hashesToQuery = Array.from(hashToAssetKeys.keys()).filter((sha256) => (
        !backendExistingHashesRef.current.has(sha256) &&
        !backendHashCheckedRef.current.has(sha256) &&
        !backendHashCheckInProgressRef.current.has(sha256)
      ));
      if (hashesToQuery.length === 0) return;

      for (const sha256 of hashesToQuery) {
        backendHashCheckInProgressRef.current.add(sha256);
      }

      const BATCH_SIZE = 500;
      try {
        for (let i = 0; i < hashesToQuery.length; i += BATCH_SIZE) {
          const batch = hashesToQuery.slice(i, i + BATCH_SIZE);
          const foundHashes = await checkHashesAgainstBackend(batch);

          for (const sha256 of batch) {
            backendHashCheckedRef.current.add(sha256);
            if (foundHashes.has(sha256)) {
              backendExistingHashesRef.current.add(sha256);
            }
          }

          for (const sha256 of foundHashes) {
            const assetKeys = hashToAssetKeys.get(sha256);
            if (!assetKeys) continue;
            for (const assetKey of assetKeys) {
              await updateAssetUploadStatus(assetKey, 'success', 'Already in library');
              setUploadStatus(s => ({ ...s, [assetKey]: 'success' }));
              setUploadNotes(n => ({ ...n, [assetKey]: 'Already in library' }));
            }
          }
        }
      } catch (e) {
        console.warn('Failed to check hashes against backend:', e);
      } finally {
        for (const sha256 of hashesToQuery) {
          backendHashCheckInProgressRef.current.delete(sha256);
        }
      }
    };

    void (async () => {
      await syncKnownExisting();
      await checkRemaining();
    })();
  }, [assetsRecord, backendHashCheckTrigger, updateAssetUploadStatus, autoCheckBackend]);

  const pauseHashing = useCallback(() => {
    bgHashPausedRef.current = true;
    setHashingPaused(true);
  }, []);

  const resumeHashing = useCallback(() => {
    bgHashPausedRef.current = false;
    setHashingPaused(false);
  }, []);

  const cancelHashing = useCallback(() => {
    bgHashRunIdRef.current++;
    bgHashPausedRef.current = false;
    setHashingPaused(false);
    setHashingProgress(null);
  }, []);

  // Ref-based lookup for assets so loadPreview doesn't depend on assetsRecord state
  const assetsRecordRef = useRef(assetsRecord);
  assetsRecordRef.current = assetsRecord;

  // Load preview for an asset.
  // Uses refs for guards instead of `previews` state so the callback identity stays stable.
  // This prevents O(n²) IntersectionObserver churn (every preview load was changing the
  // callback identity, causing every card's observer to disconnect and reconnect).
  const loadPreview = useCallback(async (keyOrAsset: string | LocalAsset) => {
    const asset = typeof keyOrAsset === 'string' ? assetsRecordRef.current[keyOrAsset] : keyOrAsset;
    if (!asset) return;

    // Check if already loaded (via ref) or currently loading
    if (blobUrlsRef.current.has(asset.key) || loadingPreviewsRef.current.has(asset.key)) return;

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

        // Generate a smaller thumbnail for images and videos
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
  }, [getFileForAsset]);

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
          sha256 = await ensureLocalAssetSha256(asset, file, updateAssetHash);
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

  // Refresh all folders
  const refresh = useCallback(async () => {
    for (const folder of rawFolders) {
      refreshFolder(folder.id);
    }
  }, [rawFolders, refreshFolder]);

  // Computed busy state (any operation in progress)
  const busy = adding || loading || scanning !== null;

  // Get unique key for an asset
  const getAssetKey = useCallback((asset: LocalAsset) => asset.key, []);

  // Restore a missing folder - opens folder picker with guidance
  // The user needs to navigate to the same folder to restore it
  const restoreMissingFolder = useCallback(async (folderName: string) => {
    // Show guidance about which folder to select
    console.info(`[LocalFolders] Please select the "${folderName}" folder to restore it`);
    // Just call addFolder - the user needs to navigate to the correct folder
    await addFolder();
  }, [addFolder]);

  // Combined list of real folders + missing folder placeholders
  const foldersWithMissing = useMemo(() => {
    const real = rawFolders.map(f => ({ id: f.id, name: f.name, isMissing: false as const }));
    const missing = missingFolderNames.map(name => ({
      id: `missing:${name}`,
      name,
      isMissing: true as const,
    }));
    return [...real, ...missing];
  }, [rawFolders, missingFolderNames]);

  // Return controller interface
  return {
    source: LOCAL_SOURCE,
    folders: rawFolders.map(f => ({ id: f.id, name: f.name })),
    foldersWithMissing,
    missingFolderNames,
    restoreMissingFolder,
    dismissMissingFolders,
    assets: assetList,
    filteredAssets,
    getAssetKey,
    refresh,
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
    loading,
    busy,
    scanning,
    error: error ?? null,
    getFileForAsset,
    hashingProgress,
    hashingPaused,
    pauseHashing,
    resumeHashing,
    cancelHashing,
  };
}
