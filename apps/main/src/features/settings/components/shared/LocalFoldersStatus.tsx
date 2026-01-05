/**
 * Local Folders Status Component
 *
 * Shows status of local folders (File System Access API based).
 * Displays folder count, asset count, hash coverage.
 */

import { Button } from '@pixsim7/shared.ui';
import { useMemo, useState, useCallback, useEffect } from 'react';

import { authService } from '@lib/auth';

import { useLocalFolders } from '@/features/assets/stores/localFoldersStore';
import { computeFileSha256 } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export function LocalFoldersStatus() {
  const supported = useLocalFolders((s) => s.supported);
  const folders = useLocalFolders((s) => s.folders);
  const assets = useLocalFolders((s) => s.assets);
  const addFolder = useLocalFolders((s) => s.addFolder);
  const adding = useLocalFolders((s) => s.adding);
  const getFileForAsset = useLocalFolders((s) => s.getFileForAsset);
  const updateAssetHash = useLocalFolders((s) => s.updateAssetHash);
  const loadPersisted = useLocalFolders((s) => s.loadPersisted);
  const userId = useAuthStore((s) => s.user?.id);

  const [computing, setComputing] = useState(false);
  const [computeProgress, setComputeProgress] = useState({ done: 0, total: 0 });

  // Load persisted folders on mount (if not already loaded)
  useEffect(() => {
    if (userId && folders.length === 0) {
      loadPersisted();
    }
  }, [userId, folders.length, loadPersisted]);

  const stats = useMemo(() => {
    const allAssets = Object.values(assets);
    const total = allAssets.length;
    const withHash = allAssets.filter((a) => a.sha256).length;
    const uploaded = allAssets.filter((a) => a.last_upload_status === 'success').length;
    const images = allAssets.filter((a) => a.kind === 'image').length;
    const videos = allAssets.filter((a) => a.kind === 'video').length;
    const withoutHash = allAssets.filter((a) => !a.sha256);

    return {
      folderCount: folders.length,
      total,
      withHash,
      withoutHash,
      hashPercentage: total > 0 ? Math.round((withHash / total) * 100) : 100,
      uploaded,
      uploadPercentage: total > 0 ? Math.round((uploaded / total) * 100) : 0,
      images,
      videos,
    };
  }, [folders, assets]);

  // Batch compute hashes for assets without them, then check against backend
  const computeHashes = useCallback(async () => {
    if (computing || stats.withoutHash.length === 0) return;

    setComputing(true);
    setComputeProgress({ done: 0, total: Math.min(100, stats.withoutHash.length) });

    const toProcess = stats.withoutHash.slice(0, 100); // Limit to 100 at a time
    const computedHashes: { sha256: string; assetKey: string }[] = [];
    let done = 0;

    for (const asset of toProcess) {
      try {
        const file = await getFileForAsset(asset);
        if (file && crypto.subtle) {
          const sha256 = await computeFileSha256(file);
          await updateAssetHash(asset.key, sha256, file);
          computedHashes.push({ sha256, assetKey: asset.key });
        }
      } catch (e) {
        console.warn('Failed to compute hash for', asset.name, e);
      }
      done++;
      setComputeProgress({ done, total: toProcess.length });
    }

    // Check computed hashes against backend
    if (computedHashes.length > 0) {
      try {
        const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const token = authService.getStoredToken();
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/check-by-hash-batch`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ hashes: computedHashes.map(h => h.sha256) }),
        });

        if (res.ok) {
          const data = await res.json();
          const foundHashes = new Set(
            (data.results || [])
              .filter((r: { exists: boolean }) => r.exists)
              .map((r: { sha256: string }) => r.sha256)
          );

          // Update status for assets that exist in system
          const updateAssetUploadStatus = useLocalFolders.getState().updateAssetUploadStatus;
          for (const { sha256, assetKey } of computedHashes) {
            if (foundHashes.has(sha256)) {
              await updateAssetUploadStatus(assetKey, 'success', 'Already in library');
            }
          }
        }
      } catch (e) {
        console.warn('Failed to check hashes against backend:', e);
      }
    }

    setComputing(false);
  }, [computing, stats.withoutHash, getFileForAsset, updateAssetHash]);

  if (!supported) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Requires Chrome/Edge with File System Access API
      </div>
    );
  }

  if (stats.folderCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground mb-3">No local folders added</p>
        <Button onClick={addFolder} disabled={adding} size="sm">
          {adding ? 'Adding...' : 'Add Folder'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium">{stats.folderCount} folder{stats.folderCount !== 1 ? 's' : ''}</div>
            <div className="text-xs text-muted-foreground">{stats.total.toLocaleString()} assets</div>
          </div>
        </div>
        <div className="flex-1" />
        <div className="text-right text-xs text-muted-foreground">
          <div>{stats.images.toLocaleString()} images</div>
          <div>{stats.videos.toLocaleString()} videos</div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-3">
        {/* Hash coverage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              {stats.hashPercentage === 100 ? (
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
                </svg>
              )}
              Hash coverage
            </span>
            <span className={stats.hashPercentage === 100 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
              {stats.hashPercentage}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all rounded-full ${stats.hashPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${stats.hashPercentage}%` }}
            />
          </div>
        </div>

        {/* Upload coverage */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              {stats.uploadPercentage === 100 ? (
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
              In library
            </span>
            <span className={stats.uploadPercentage === 100 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
              {stats.uploaded.toLocaleString()} / {stats.total.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all rounded-full ${stats.uploadPercentage === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${stats.uploadPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {stats.withoutHash.length > 0 && (
          <Button onClick={computeHashes} disabled={computing} size="sm" variant="default">
            {computing
              ? `Hashing... ${computeProgress.done}/${computeProgress.total}`
              : `Hash ${Math.min(100, stats.withoutHash.length)} files`}
          </Button>
        )}
        <Button onClick={addFolder} disabled={adding} variant="outline" size="sm">
          {adding ? 'Adding...' : 'Add Folder'}
        </Button>
      </div>
    </div>
  );
}
