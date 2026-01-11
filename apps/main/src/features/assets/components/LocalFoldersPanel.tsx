import { useProviders } from '@features/providers';
import { Icons } from '@lib/icons';
import { useMemo, useCallback } from 'react';

import { useLocalFoldersController } from '@features/assets/hooks/useLocalFoldersController';

import { AssetGallery, GalleryEmptyState, type AssetUploadState } from '@/components/media/AssetGallery';

import { useAssetViewer } from '../hooks/useAssetViewer';
import type { LocalAsset } from '../stores/localFoldersStore';

import { TreeFolderView } from './TreeFolderView';

interface LocalFoldersPanelProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

export function LocalFoldersPanel({ layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const controller = useLocalFoldersController();
  const { providers } = useProviders();

  const folderNames = useMemo(() => {
    return controller.folders.reduce((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {} as Record<string, string>);
  }, [controller.folders]);
  const localMetadataResolver = useCallback(
    (asset: LocalAsset) => ({
      folderName: folderNames[asset.folderId],
    }),
    [folderNames]
  );
  const { openLocalAsset } = useAssetViewer({
    source: 'local',
    localMetadataResolver,
  });

  // Determine which assets to show based on folder selection
  const displayAssets = useMemo(() => {
    if (controller.selectedFolderPath) {
      return controller.filteredAssets;
    }
    return controller.assets;
  }, [controller.selectedFolderPath, controller.filteredAssets, controller.assets]);

  // Callbacks for AssetGallery - memoized to prevent re-renders
  const getAssetKey = useCallback((asset: LocalAsset) => asset.key, []);
  const getPreviewUrl = useCallback(
    (asset: LocalAsset) => controller.previews[asset.key],
    [controller.previews]
  );
  const getMediaType = useCallback(
    (asset: LocalAsset) => (asset.kind === 'video' ? 'video' : 'image') as const,
    []
  );
  // Build a map of SHA → count for duplicate detection
  const shaDuplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of controller.assets) {
      if (asset.sha256) {
        counts.set(asset.sha256, (counts.get(asset.sha256) || 0) + 1);
      }
    }
    return counts;
  }, [controller.assets]);

  const getDescription = useCallback((asset: LocalAsset) => {
    const parts = [asset.name];

    // Add file size inline
    if (asset.size) {
      const sizeKB = asset.size / 1024;
      const sizeMB = sizeKB / 1024;
      const sizeStr = sizeMB >= 1
        ? `${sizeMB.toFixed(1)}MB`
        : `${Math.round(sizeKB)}KB`;
      parts.push(`(${sizeStr})`);
    }

    // Add SHA prefix if available
    if (asset.sha256) {
      parts.push(`• #${asset.sha256.slice(0, 6)}`);
    }

    return parts.join(' ');
  }, []);
  const getTags = useCallback(
    (asset: LocalAsset) => {
      const tags: string[] = [];

      // Folder path (if in subdirectory)
      const folderPath = asset.relativePath.split('/').slice(0, -1).join('/');
      if (folderPath) {
        tags.push(`📁 ${folderPath}`);
      }

      // File size
      if (asset.size) {
        const sizeKB = asset.size / 1024;
        const sizeMB = sizeKB / 1024;
        const sizeStr = sizeMB >= 1
          ? `${sizeMB.toFixed(1)} MB`
          : `${Math.round(sizeKB)} KB`;
        tags.push(sizeStr);
      }

      // SHA256 prefix (if computed) + duplicate indicator
      if (asset.sha256) {
        const dupCount = shaDuplicates.get(asset.sha256) || 1;
        if (dupCount > 1) {
          tags.push(`⚠️ ${dupCount} copies`);
        }
        tags.push(`#${asset.sha256.slice(0, 8)}`);
      }

      // Upload status
      if (asset.last_upload_status === 'success') {
        tags.push('✓ uploaded');
      } else if (asset.last_upload_asset_id) {
        tags.push(`→ asset:${asset.last_upload_asset_id}`);
      }

      return tags;
    },
    [shaDuplicates]
  );
  const getCreatedAt = useCallback(
    (asset: LocalAsset) => new Date(asset.lastModified || Date.now()).toISOString(),
    []
  );
  const getUploadState = useCallback(
    (asset: LocalAsset): AssetUploadState => controller.uploadStatus[asset.key] || 'idle',
    [controller.uploadStatus]
  );
  const handleOpen = useCallback(
    (asset: LocalAsset) => {
      const previewUrl = controller.previews[asset.key];
      openLocalAsset(asset, previewUrl, displayAssets, controller.previews);
    },
    [openLocalAsset, displayAssets, controller.previews]
  );
  const handleUpload = useCallback(
    (asset: LocalAsset) => controller.uploadOne(asset),
    [controller.uploadOne]
  );

  // Empty state for no folders
  const noFoldersEmptyState = (
    <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
      <div className="mb-4 flex justify-center">
        <Icons.folder size={64} className="text-neutral-400" />
      </div>
      <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
        {controller.folders.length === 0 ? 'No folders added yet' : 'No files found'}
      </p>
      <p className="text-sm text-neutral-500">
        {controller.folders.length === 0
          ? 'Click "Add Folder" to get started'
          : 'Added folders contain no media files'}
      </p>
    </div>
  );

  // Empty state for selected folder with no files
  const folderEmptyState = (
    <GalleryEmptyState
      icon="folder"
      title="No files in this folder"
    />
  );

  const renderMainContent = () => {
    // Show "no folders" empty state
    if (controller.assets.length === 0) {
      return noFoldersEmptyState;
    }

    // Show folder-specific empty state when folder is selected but empty
    if (controller.selectedFolderPath && displayAssets.length === 0) {
      return folderEmptyState;
    }

    return (
      <AssetGallery
        assets={displayAssets}
        getAssetKey={getAssetKey}
        getPreviewUrl={getPreviewUrl}
        loadPreview={controller.loadPreview}
        getMediaType={getMediaType}
        getDescription={getDescription}
        getTags={getTags}
        getCreatedAt={getCreatedAt}
        getUploadState={getUploadState}
        onOpen={handleOpen}
        onUpload={handleUpload}
        layout={layout}
        cardSize={cardSize}
      />
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 mb-4 px-6">
        <h2 className="text-lg font-semibold">Local Folders</h2>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 px-6">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          {/* Add Folder + support/error */}
          <div className="space-y-2">
            <button
              className="w-full px-4 py-2 border rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              onClick={controller.addFolder}
              disabled={controller.adding || controller.scanning !== null || !controller.supported}
            >
              <Icons.folderOpen size={18} />
              {controller.adding ? 'Adding...' : 'Add Folder'}
            </button>

            {/* Scanning progress indicator */}
            {controller.scanning && (
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="font-medium">Scanning folder...</span>
                </div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 space-y-0.5">
                  <div>Files scanned: {controller.scanning.scanned.toLocaleString()}</div>
                  <div>Media found: {controller.scanning.found.toLocaleString()}</div>
                  {controller.scanning.currentPath && (
                    <div className="truncate opacity-75" title={controller.scanning.currentPath}>
                      {controller.scanning.currentPath}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!controller.supported && (
              <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400 flex items-center gap-2">
                <Icons.alertTriangle size={16} />
                <span>Your browser does not support local folder access. Use Chrome/Edge.</span>
              </div>
            )}
            {controller.error && (
              <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400">
                {controller.error}
              </div>
            )}
          </div>

          {/* Provider selection */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Upload to
            </label>
            <select
              className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={controller.providerId || ''}
              onChange={(e) => controller.setProviderId(e.target.value || undefined)}
            >
              <option value="">Select provider</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Folder selection + list */}
          {controller.folders.length > 0 && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
              <div className="text-[11px] font-medium p-2 text-neutral-500 dark:text-neutral-400 px-3 flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-700">
                <Icons.folderTree size={12} />
                <span>All Local Folders</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <TreeFolderView
                  assets={controller.assets}
                  folderNames={folderNames}
                  folderOrder={controller.folders.map(f => f.id)}
                  onFileClick={controller.openViewer}
                  onPreview={controller.loadPreview}
                  previews={controller.previews}
                  uploadStatus={controller.uploadStatus}
                  onUpload={controller.uploadOne}
                  providerId={controller.providerId}
                  compactMode={true}
                  selectedFolderPath={controller.selectedFolderPath || undefined}
                  onFolderSelect={controller.setSelectedFolderPath}
                />
              </div>
            </div>
          )}
        </div>

        {/* Main content - scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-6">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}
