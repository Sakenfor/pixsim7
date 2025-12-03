import { useEffect, useMemo, useRef } from 'react';
import { useLocalFoldersController } from '@/hooks/useLocalFoldersController';
import { useProviders } from '@/hooks/useProviders';
import { TreeFolderView } from './TreeFolderView';
import { MediaViewerCube } from './MediaViewerCube';
import { MediaCard } from '../media/MediaCard';
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

export function LocalFoldersPanel() {
  const controller = useLocalFoldersController();
  const { providers } = useProviders();

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

    if (controller.viewMode === 'tree') {
      // Tree mode: Shows filtered assets based on selected folder
      return (
        <div>
          {controller.selectedFolderPath && controller.filteredAssets.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {controller.filteredAssets.map(asset => {
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
              })}
            </div>
          ) : controller.selectedFolderPath ? (
            <div className="flex items-center justify-center h-[60vh] text-neutral-500">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <Icons.folderOpen size={48} className="text-neutral-400" />
                </div>
                <p>No files in this folder</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[60vh] text-neutral-500">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <Icons.cursorClick size={48} className="text-neutral-400" />
                </div>
                <p>Select a folder from the sidebar</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (controller.viewMode === 'grid') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {controller.assets.map(asset => {
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
          })}
        </div>
      );
    }

    // List view
    return (
      <div className="border rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <th className="text-left p-3 font-medium">Preview</th>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Path</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {controller.assets.map(a => (
                <tr key={a.key} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                  <td className="p-3">
                    <div
                      className="w-16 h-12 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center overflow-hidden cursor-pointer"
                      onClick={() => controller.openViewer(a)}
                    >
                      {controller.previews[a.key] ? (
                        a.kind === 'image' ? (
                          <img src={controller.previews[a.key]} className="w-full h-full object-cover" alt={a.name} />
                        ) : (
                          <video src={controller.previews[a.key]} className="w-full h-full object-cover" muted />
                        )
                      ) : (
                        <div className="text-xs text-neutral-500">
                          {a.kind === 'image' ? <Icons.image size={16} /> : <Icons.video size={16} />}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-medium cursor-pointer hover:text-blue-600" onClick={() => controller.openViewer(a)}>
                    {a.name}
                  </td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                    {a.relativePath}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">
                      {a.kind}
                    </span>
                  </td>
                  <td className="p-3 text-neutral-600 dark:text-neutral-400">
                    {a.size ? `${(a.size / 1024 / 1024).toFixed(1)} MB` : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {!controller.previews[a.key] && (
                        <button
                          onClick={() => controller.loadPreview(a.key)}
                          className="px-2 py-1 text-xs border rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          Preview
                        </button>
                      )}
                      <button
                        onClick={() => controller.uploadOne(a.key)}
                        disabled={!controller.providerId || controller.uploadStatus[a.key] === 'uploading'}
                        className={`px-3 py-1 text-xs rounded font-medium flex items-center gap-1.5 ${
                          controller.uploadStatus[a.key] === 'success'
                            ? 'bg-green-600 text-white'
                            : controller.uploadStatus[a.key] === 'error'
                            ? 'bg-red-600 text-white'
                            : controller.uploadStatus[a.key] === 'uploading'
                            ? 'bg-neutral-400 text-white'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                        title={
                          controller.uploadStatus[a.key] === 'success'
                            ? controller.uploadNotes[a.key] || 'Uploaded successfully'
                            : controller.uploadStatus[a.key] === 'error'
                            ? controller.uploadNotes[a.key] || 'Upload failed'
                            : 'Upload to provider'
                        }
                      >
                        {controller.uploadStatus[a.key] === 'uploading' ? (
                          <>
                            <Icons.loader size={12} className="animate-spin" />
                            Uploading...
                          </>
                        ) : controller.uploadStatus[a.key] === 'success' ? (
                          <>
                            <Icons.check size={12} />
                            Uploaded
                          </>
                        ) : controller.uploadStatus[a.key] === 'error' ? (
                          <>
                            <Icons.close size={12} />
                            Failed
                          </>
                        ) : (
                          <>
                            <Icons.upload size={12} />
                            Upload
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-4">
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

          {/* View Mode + Provider */}
          <div className="space-y-2">
            <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
              <button
                onClick={() => controller.setViewMode('tree')}
                className={`flex-1 px-3 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1.5 ${
                  controller.viewMode === 'tree'
                    ? 'bg-white dark:bg-neutral-700 shadow'
                    : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
                title="Tree view - filtered by selected folder"
              >
                <Icons.folder size={14} />
                Tree
              </button>
              <button
                onClick={() => controller.setViewMode('grid')}
                className={`flex-1 px-3 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1.5 ${
                  controller.viewMode === 'grid'
                    ? 'bg-white dark:bg-neutral-700 shadow'
                    : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
                title="Grid view - all files"
              >
                <Icons.layoutGrid size={14} />
                Grid
              </button>
              <button
                onClick={() => controller.setViewMode('list')}
                className={`flex-1 px-3 py-1 text-xs rounded transition-colors flex items-center justify-center gap-1.5 ${
                  controller.viewMode === 'list'
                    ? 'bg-white dark:bg-neutral-700 shadow'
                    : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
                title="List view - all files"
              >
                <Icons.clipboardList size={14} />
                List
              </button>
            </div>

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

        {/* Main content */}
        <div className="flex-1">
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
