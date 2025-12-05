import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocalFoldersController } from '@/hooks/useLocalFoldersController';
import { useProviders } from '@/hooks/useProviders';
import { TreeFolderView } from './TreeFolderView';
import { MediaViewerCube } from './MediaViewerCube';
import { MediaCard } from '../media/MediaCard';
import { MasonryGrid } from '../layout/MasonryGrid';
import type { LocalAsset } from '@/stores/localFoldersStore';
import { Icons } from '@/lib/icons';

function useLazyLoadPreview(
  asset: LocalAsset,
  previewUrl: string | undefined,
  loadPreview: (asset: LocalAsset) => Promise<void>,
  revokePreview?: (assetKey: string) => void,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Element is visible - load preview if not loaded
            wasVisibleRef.current = true;
            if (!previewUrl) {
              loadPreview(asset);
            }
          } else if (wasVisibleRef.current && previewUrl && revokePreview) {
            // Element scrolled out of view - revoke blob URL to free memory
            // Only revoke if it was previously visible (avoid revoking on initial render)
            revokePreview(asset.key);
            wasVisibleRef.current = false;
          }
        });
      },
      { rootMargin: '400px' },  // Load earlier, cleanup later for smooth scrolling
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [asset, previewUrl, loadPreview, revokePreview]);

  return ref;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

function getLocalAssetNumericId(asset: LocalAsset): number {
  let hash = 0;
  for (let i = 0; i < asset.key.length; i += 1) {
    const chr = asset.key.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  const id = Math.abs(hash);
  return id || 1;
}

function uploadStatusToProviderStatus(status: UploadState | undefined) {
  if (status === 'success') return 'ok' as const;
  if (status === 'error') return 'local_only' as const;
  return undefined;
}

function TreeLazyMediaCard(props: {
  asset: LocalAsset;
  previewUrl: string | undefined;
  loadPreview: (asset: LocalAsset) => Promise<void>;
  revokePreview?: (assetKey: string) => void;
  status: UploadState;
  openViewer: (asset: LocalAsset) => void;
  uploadOne: (asset: LocalAsset) => Promise<void>;
}) {
  const { asset, previewUrl, loadPreview, revokePreview, status, openViewer, uploadOne } = props;
  const cardRef = useLazyLoadPreview(asset, previewUrl, loadPreview, revokePreview);
  const providerStatus = uploadStatusToProviderStatus(status);

  return (
    <div ref={cardRef}>
      <MediaCard
        id={getLocalAssetNumericId(asset)}
        mediaType={asset.kind === 'video' ? 'video' : 'image'}
        providerId="local"
        providerAssetId={asset.key}
        thumbUrl={previewUrl || ''}
        remoteUrl={previewUrl || ''}
        width={0}
        height={0}
        tags={[asset.relativePath.split('/').slice(0, -1).join('/')]}
        description={asset.name}
        createdAt={new Date(asset.lastModified || Date.now()).toISOString()}
        onOpen={() => openViewer(asset)}
        providerStatus={providerStatus}
        uploadState={status}
        onUploadClick={async () => {
          await uploadOne(asset);
        }}
      />
    </div>
  );
}

interface LocalFoldersPanelProps {
  layout?: 'masonry' | 'grid';
  cardSize?: number;
}

// Pagination settings for large folders
const INITIAL_DISPLAY_LIMIT = 50;
const LOAD_MORE_INCREMENT = 50;

export function LocalFoldersPanel({ layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const controller = useLocalFoldersController();
  const { providers } = useProviders();

  // Layout settings (gaps)
  const [layoutSettings] = useState({ rowGap: 16, columnGap: 16 });

  // Pagination state - reset when folder changes
  const [displayLimit, setDisplayLimit] = useState(INITIAL_DISPLAY_LIMIT);
  const prevFolderPath = useRef(controller.selectedFolderPath);

  // Reset display limit when folder selection changes
  useEffect(() => {
    if (prevFolderPath.current !== controller.selectedFolderPath) {
      setDisplayLimit(INITIAL_DISPLAY_LIMIT);
      prevFolderPath.current = controller.selectedFolderPath;
    }
  }, [controller.selectedFolderPath]);

  const folderNames = useMemo(() => {
    return controller.folders.reduce((acc, f) => {
      acc[f.id] = f.name;
      return acc;
    }, {} as Record<string, string>);
  }, [controller.folders]);

  const selectedRootFolderId = useMemo(() => {
    if (controller.selectedFolderPath) {
      return controller.selectedFolderPath.split('/')[0];
    }
    return controller.folders[0]?.id;
  }, [controller.selectedFolderPath, controller.folders]);


  // Determine which assets to show based on folder selection
  const allDisplayAssets = useMemo(() => {
    // If a folder is selected, show filtered assets for that folder
    if (controller.selectedFolderPath) {
      return controller.filteredAssets;
    }
    // Otherwise show all assets
    return controller.assets;
  }, [controller.selectedFolderPath, controller.filteredAssets, controller.assets]);

  // Apply pagination limit
  const displayAssets = useMemo(() => {
    return allDisplayAssets.slice(0, displayLimit);
  }, [allDisplayAssets, displayLimit]);

  const hasMore = allDisplayAssets.length > displayLimit;
  const remainingCount = allDisplayAssets.length - displayLimit;

  const loadMore = useCallback(() => {
    setDisplayLimit(prev => prev + LOAD_MORE_INCREMENT);
  }, []);

  // Render media cards for gallery layouts
  const cardItems = displayAssets.map(asset => {
    const status = controller.uploadStatus[asset.key] || 'idle';
    const previewUrl = controller.previews[asset.key];
    return (
      <TreeLazyMediaCard
        key={asset.key}
        asset={asset}
        previewUrl={previewUrl}
        loadPreview={controller.loadPreview}
        revokePreview={controller.revokePreview}
        status={status}
        openViewer={controller.openViewer}
        uploadOne={controller.uploadOne}
      />
    );
  });

  const renderMainContent = () => {
    if (controller.assets.length === 0) {
      return (
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
    }

    // Empty state when folder is selected but no assets in that folder
    if (controller.selectedFolderPath && displayAssets.length === 0) {
      return (
        <div className="flex items-center justify-center h-[60vh] text-neutral-500">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <Icons.folderOpen size={48} className="text-neutral-400" />
            </div>
            <p>No files in this folder</p>
          </div>
        </div>
      );
    }


    // Load More button component
    const loadMoreButton = hasMore && (
      <div className="flex justify-center py-6">
        <button
          onClick={loadMore}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <Icons.chevronDown size={16} />
          Load More ({remainingCount.toLocaleString()} remaining)
        </button>
      </div>
    );

    // Asset count indicator
    const assetCountIndicator = allDisplayAssets.length > 0 && (
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
        Showing {displayAssets.length.toLocaleString()} of {allDisplayAssets.length.toLocaleString()} files
      </div>
    );

    // Render masonry or grid layout
    if (layout === 'masonry') {
      return (
        <>
          {assetCountIndicator}
          <MasonryGrid
            items={cardItems}
            rowGap={layoutSettings.rowGap}
            columnGap={layoutSettings.columnGap}
            minColumnWidth={cardSize}
          />
          {loadMoreButton}
        </>
      );
    }

    // Grid layout
    return (
      <>
        {assetCountIndicator}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`,
            rowGap: `${layoutSettings.rowGap}px`,
            columnGap: `${layoutSettings.columnGap}px`,
          }}
        >
          {cardItems}
        </div>
        {loadMoreButton}
      </>
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

      {/* Media Viewer Cube */}
      {controller.viewerAsset && (
        <MediaViewerCube
          asset={controller.viewerAsset}
          assetUrl={controller.previews[controller.viewerAsset.key]}
          allAssets={controller.assets}
          onClose={controller.closeViewer}
          onNavigate={controller.navigateViewer}
        />
      )}
    </div>
  );
}
