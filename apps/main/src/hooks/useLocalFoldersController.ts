/**
 * useLocalFoldersController
 *
 * Controller hook for local folders that separates business logic from UI.
 * Manages folder state, asset filtering, previews, uploads, and viewer navigation.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useLocalFolders,
  getLocalThumbnailBlob,
  setLocalThumbnailBlob,
  type LocalAsset,
} from '../stores/localFoldersStore';
import { usePersistentState } from './usePersistentState';
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
    error,
    getFileForAsset,
    updateAssetUploadStatus,
  } = useLocalFolders();

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

  // Viewer state
  const [viewerAsset, setViewerAsset] = useState<LocalAsset | null>(null);

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
  }, []);

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

  // Load preview for an asset
  const loadPreview = async (keyOrAsset: string | LocalAsset) => {
    const asset = typeof keyOrAsset === 'string' ? assetsRecord[keyOrAsset] : keyOrAsset;
    if (!asset) return;
    if (previews[asset.key]) return;

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
        if (!file) return;
        url = URL.createObjectURL(file);
        // Cache original file blob as thumbnail for future sessions
        void setLocalThumbnailBlob(asset, file);
      } catch {
        url = undefined;
      }
    }

    if (url) {
      setPreviews(p => ({ ...p, [asset.key]: url }));
    }
  };

  // Open viewer
  const openViewer = async (asset: LocalAsset) => {
    // Ensure preview is loaded
    await loadPreview(asset);
    setViewerAsset(asset);
  };

  // Close viewer
  const closeViewer = () => {
    setViewerAsset(null);
  };

  // Navigate viewer (prev/next)
  const navigateViewer = (direction: 'prev' | 'next') => {
    if (!viewerAsset) return;
    const sourceList = viewMode === 'tree' && selectedFolderPath ? filteredAssets : assetList;

    const currentIndex = sourceList.findIndex(a => a.key === viewerAsset.key);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < sourceList.length) {
      const newAsset = sourceList[newIndex];
      loadPreview(newAsset);
      setViewerAsset(newAsset);
    }
  };

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
      const form = new FormData();
      form.append('file', file, asset.name);
      form.append('provider_id', providerId);
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
    error: error ?? null,
  };
}
