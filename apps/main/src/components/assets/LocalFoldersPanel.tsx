import { useEffect, useMemo, useRef, useState } from 'react';
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
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (previewUrl) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadPreview(asset);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [asset, previewUrl, loadPreview]);

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
  status: UploadState;
  openViewer: (asset: LocalAsset) => void;
  uploadOne: (asset: LocalAsset) => Promise<void>;
}) {
  const { asset, previewUrl, loadPreview, status, openViewer, uploadOne } = props;
  const cardRef = useLazyLoadPreview(asset, previewUrl, loadPreview);
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

export function LocalFoldersPanel({ layout = 'masonry', cardSize = 260 }: LocalFoldersPanelProps) {
  const controller = useLocalFoldersController();
  const { providers } = useProviders();

  // Layout settings (gaps)
  const [layoutSettings] = useState({ rowGap: 16, columnGap: 16 });

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
  const displayAssets = useMemo(() => {
    // If a folder is selected, show filtered assets for that folder
    if (controller.selectedFolderPath) {
      return controller.filteredAssets;
    }
    // Otherwise show all assets
    return controller.assets;
  }, [controller.selectedFolderPath, controller.filteredAssets, controller.assets]);

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


    // Render masonry or grid layout
    if (layout === 'masonry') {
      return (
        <MasonryGrid
          items={cardItems}
          rowGap={layoutSettings.rowGap}
          columnGap={layoutSettings.columnGap}
          minColumnWidth={cardSize}
        />
      );
    }

    // Grid layout
    return (
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
              disabled={controller.adding || !controller.supported}
            >
              <Icons.folderOpen size={18} />
              {controller.adding ? 'Adding...' : 'Add Folder'}
            </button>

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
