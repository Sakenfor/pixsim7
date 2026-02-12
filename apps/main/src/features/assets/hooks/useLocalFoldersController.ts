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
    getUploadRecordByHash,
    setUploadRecordByHash,
    updateAssetUploadStatus,
    missingFolderNames,
    dismissMissingFolders,
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

  // Track which selected folder scopes have completed local SHA computation
  const hashCheckedFoldersRef = useRef<Map<string, string>>(new Map());
  const hashCheckInProgressRef = useRef<Set<string>>(new Set());
  const backendHashCheckedRef = useRef<Set<string>>(new Set());
  const backendExistingHashesRef = useRef<Set<string>>(new Set());
  const backendHashCheckInProgressRef = useRef<Set<string>>(new Set());

  // Hashing progress (for selected folder scope)
  const [hashingProgress, setHashingProgress] = useState<{ total: number; done: number } | null>(null);

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
  // Backend existence checks are handled globally so this work is not tied
  // to a specific tree selection.
  useEffect(() => {
    if (!selectedFolderPath || !crypto.subtle) return;

    if (filteredAssets.length === 0) return;

    const scopeKey = selectedFolderPath;
    const scopeSignature = computeLocalAssetScopeSignature(filteredAssets);

    // Skip if already checked or in progress for the same scope signature
    if (hashCheckInProgressRef.current.has(scopeKey)) return;
    if (hashCheckedFoldersRef.current.get(scopeKey) === scopeSignature) return;

    // Get assets that need hashing
    const assetsToHash = filteredAssets.filter(asset => {
      // Skip if already has valid hash
      if (hasValidStoredHash(asset)) {
        return false;
      }
      // Skip if already marked as success (uploaded)
      if (asset.last_upload_status === 'success') return false;
      return true;
    });

    // If nothing to do, mark as checked for this scope signature.
    if (assetsToHash.length === 0) {
      hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
      return;
    }

    // Mark as in progress
    hashCheckInProgressRef.current.add(scopeKey);

    // Background hash computation for this selected scope.
    const computeHashes = async () => {
      try {
        // Compute hashes for assets that need it (in chunks to avoid blocking UI)
        const CHUNK_SIZE = 5;
        for (let i = 0; i < assetsToHash.length; i += CHUNK_SIZE) {
          const chunk = assetsToHash.slice(i, i + CHUNK_SIZE);

          await Promise.all(chunk.map(async (asset) => {
            try {
              const file = await getFileForAsset(asset);
              if (!file) return;

              await ensureLocalAssetSha256(asset, file, updateAssetHash);
            } catch (e) {
              console.warn('Failed to hash asset:', asset.name, e);
            }
          }));

          // Yield to main thread between chunks
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally {
        hashCheckInProgressRef.current.delete(scopeKey);
        hashCheckedFoldersRef.current.set(scopeKey, scopeSignature);
      }
    };

    void computeHashes();
  }, [selectedFolderPath, filteredAssets, getFileForAsset, updateAssetHash]);

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
  }, [assetsRecord, backendHashCheckTrigger, updateAssetUploadStatus]);

  // Background SHA computation for ALL assets after folder load.
  // Use a signature that tracks file identity/metadata changes (but not sha fields)
  // so hash writes don't continuously retrigger this effect.
  const backgroundHashTrigger = useMemo(() => {
    return computeStableSignature(
      Object.values(assetsRecord).map(
        asset => `${asset.key}|${asset.size ?? -1}|${asset.lastModified ?? -1}|${asset.last_upload_status ?? ''}`
      )
    );
  }, [assetsRecord]);
  const backgroundHashAssetCount = useMemo(
    () => Object.keys(assetsRecord).length,
    [assetsRecord]
  );

  // Reads/writes via useLocalFolders.getState() to avoid triggering React renders
  // during the hashing loop (which caused "Maximum update depth exceeded").
  useEffect(() => {
    if (!crypto.subtle || backgroundHashAssetCount === 0) return;

    // Snapshot assets that need hashing from the store directly
    const storeAssets = Object.values(useLocalFolders.getState().assets);
    const needsHash = storeAssets.filter(asset => {
      if (hasValidStoredHash(asset)) {
        return false;
      }
      if (asset.last_upload_status === 'success') return false;
      return true;
    });

    if (needsHash.length === 0) {
      setHashingProgress(null);
      return;
    }

    const runId = ++bgHashRunIdRef.current;
    setHashingProgress({ total: needsHash.length, done: 0 });

    const run = async () => {
      const CHUNK_SIZE = 3;
      let done = 0;

      for (let i = 0; i < needsHash.length; i += CHUNK_SIZE) {
        if (bgHashRunIdRef.current !== runId) return;

        const chunk = needsHash.slice(i, i + CHUNK_SIZE);

        // Process each asset sequentially within a chunk to limit concurrent store writes
        for (const asset of chunk) {
          if (bgHashRunIdRef.current !== runId) return;
          try {
            const { getFileForAsset: getFile, updateAssetHash: updateHash } = useLocalFolders.getState();
            const file = await getFile(asset);
            if (!file) continue;
            await ensureLocalAssetSha256(asset, file, updateHash);
          } catch (e) {
            console.warn('Background hash failed:', asset.name, e);
          }
        }

        done += chunk.length;
        if (bgHashRunIdRef.current === runId) {
          setHashingProgress({ total: needsHash.length, done });
        }

        // Real delay between chunks to let React process pending updates
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (bgHashRunIdRef.current === runId) {
        setHashingProgress(null);
      }
    };

    void run();

    return () => { bgHashRunIdRef.current++; };
     
  }, [backgroundHashTrigger, backgroundHashAssetCount]);

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
            const sha256 = await ensureLocalAssetSha256(asset, file, updateAssetHash);
            if (sha256 && asset.last_upload_status !== 'success') {
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
  };
}
