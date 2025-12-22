/**
 * Local Folders Status Component
 *
 * Shows status of local folders (File System Access API based).
 * Displays folder count, asset count, hash coverage.
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Button } from '@pixsim7/shared.ui';
import { useLocalFolders, type LocalAsset } from '@/features/assets/stores/localFoldersStore';
import { useAuthStore } from '@/stores/authStore';
import { computeFileSha256 } from '@/lib/utils';

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

  // Batch compute hashes for assets without them
  const computeHashes = useCallback(async () => {
    if (computing || stats.withoutHash.length === 0) return;

    setComputing(true);
    setComputeProgress({ done: 0, total: Math.min(100, stats.withoutHash.length) });

    const toProcess = stats.withoutHash.slice(0, 100); // Limit to 100 at a time
    let done = 0;

    for (const asset of toProcess) {
      try {
        const file = await getFileForAsset(asset);
        if (file && crypto.subtle) {
          const sha256 = await computeFileSha256(file);
          await updateAssetHash(asset.key, sha256, file);
        }
      } catch (e) {
        console.warn('Failed to compute hash for', asset.name, e);
      }
      done++;
      setComputeProgress({ done, total: toProcess.length });
    }

    setComputing(false);
  }, [computing, stats.withoutHash, getFileForAsset, updateAssetHash]);

  if (!supported) {
    return (
      <div className="text-sm text-muted-foreground">
        Local folders require Chrome/Edge with File System Access API
      </div>
    );
  }

  if (stats.folderCount === 0) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          No local folders added yet
        </div>
        <Button onClick={addFolder} disabled={adding} size="sm">
          {adding ? 'Adding...' : 'Add Folder'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {stats.folderCount} folder{stats.folderCount !== 1 ? 's' : ''} &middot; {stats.total} assets
        </span>
        <span className="text-muted-foreground">
          {stats.images} images, {stats.videos} videos
        </span>
      </div>

      {/* Hash coverage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Hash coverage</span>
          <span className={stats.hashPercentage === 100 ? 'text-green-600' : 'text-orange-600'}>
            {stats.withHash} / {stats.total} ({stats.hashPercentage}%)
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-600 transition-all"
            style={{ width: `${stats.hashPercentage}%` }}
          />
        </div>
      </div>

      {/* Upload coverage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Uploaded to providers</span>
          <span className="text-muted-foreground">
            {stats.uploaded} / {stats.total} ({stats.uploadPercentage}%)
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${stats.uploadPercentage}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {stats.withoutHash.length > 0 && (
          <Button onClick={computeHashes} disabled={computing} size="sm">
            {computing
              ? `Computing... ${computeProgress.done}/${computeProgress.total}`
              : `Compute Hashes (${Math.min(100, stats.withoutHash.length)})`}
          </Button>
        )}
        <Button onClick={addFolder} disabled={adding} variant="outline" size="sm">
          {adding ? 'Adding...' : 'Add Folder'}
        </Button>
      </div>
    </div>
  );
}
