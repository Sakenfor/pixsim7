import { useEffect, useMemo, useRef } from 'react';
import { useLocalFoldersController } from '@/hooks/useLocalFoldersController';
import { useProviders } from '@/hooks/useProviders';
import { TreeFolderView } from './TreeFolderView';
import { MediaViewerCube } from './MediaViewerCube';
import { MediaCard } from '../media/MediaCard';
import type { LocalAsset } from '@/stores/localFoldersStore';

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

  return (
    <div ref={cardRef}>
      <MediaCard
        id={parseInt(asset.key.split('-')[0] || '0')}
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
        uploadState={status}
        onUploadClick={async () => {
          await uploadOne(asset);
        }}
      />
    </div>
  );
}

function GridLazyCard(props: {
  asset: LocalAsset;
  previewUrl: string | undefined;
  loadPreview: (asset: LocalAsset) => Promise<void>;
  providerId: string | undefined;
  uploadStatus: UploadState;
  uploadNote?: string;
  openViewer: (asset: LocalAsset) => void;
  uploadOne: (assetKey: string) => Promise<void>;
}) {
  const { asset, previewUrl, loadPreview, providerId, uploadStatus, uploadNote, openViewer, uploadOne } = props;
  const cardRef = useLazyLoadPreview(asset, previewUrl, loadPreview);

  return (
    <div
      ref={cardRef}
      className="border rounded-lg overflow-hidden bg-white dark:bg-neutral-900 relative group hover:shadow-lg transition-shadow"
    >
      <div
        className="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
        onClick={() => openViewer(asset)}
      >
        {asset.kind === 'image' && previewUrl && (
          <img src={previewUrl} className="w-full h-full object-cover" alt={asset.name} />
        )}
        {asset.kind === 'video' && previewUrl && (
          <video src={previewUrl} className="w-full h-full object-cover" muted autoPlay loop />
        )}
        {!previewUrl && (
          <div className="text-4xl opacity-50 group-hover:opacity-100 transition-opacity">
            {asset.kind === 'image' ? 'dY-мЛ,?' : 'dYZк'}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            uploadOne(asset.key);
          }}
          disabled={!providerId || uploadStatus === 'uploading'}
          className={`px-2 py-1 text-[10px] rounded-md shadow-lg font-medium transition-all ${
            uploadStatus === 'success'
              ? 'bg-green-600 text-white'
              : uploadStatus === 'error'
              ? 'bg-red-600 text-white'
              : uploadStatus === 'uploading'
              ? 'bg-neutral-400 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          title={
            uploadStatus === 'success'
              ? uploadNote || 'Uploaded successfully'
              : uploadStatus === 'error'
              ? 'Upload failed'
              : 'Upload to provider'
          }
        >
          {uploadStatus === 'uploading'
            ? 'Г+`...'
            : uploadStatus === 'success'
            ? 'Гo"'
            : uploadStatus === 'error'
            ? 'Гo-'
            : 'Г+`'}
        </button>
      </div>
      <div className="p-3 space-y-1">
        <div className="font-medium text-sm truncate" title={asset.name}>
          {asset.name}
        </div>
        <div className="text-xs text-neutral-500">
          {asset.kind} {asset.size ? `Г?Ы ${(asset.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </div>
        {asset.relativePath.includes('/') && (
          <div className="text-xs text-neutral-400 truncate" title={asset.relativePath}>
            dY"? {asset.relativePath.split('/').slice(0, -1).join('/')}
          </div>
        )}
      </div>
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

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          className="px-4 py-2 border rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors font-medium"
          onClick={controller.addFolder}
          disabled={controller.adding || !controller.supported}
        >
          {controller.adding ? '📂 Adding...' : '📂 Add Folder'}
        </button>

        {!controller.supported && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
            ⚠️ Your browser does not support local folder access. Use Chrome/Edge.
          </div>
        )}
        {controller.error && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
            {controller.error}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            <button
              onClick={() => controller.setViewMode('tree')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                controller.viewMode === 'tree'
                  ? 'bg-white dark:bg-neutral-700 shadow'
                  : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="Tree view"
            >
              🌳 Tree
            </button>
            <button
              onClick={() => controller.setViewMode('grid')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                controller.viewMode === 'grid'
                  ? 'bg-white dark:bg-neutral-700 shadow'
                  : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="Grid view"
            >
              ⊞ Grid
            </button>
            <button
              onClick={() => controller.setViewMode('list')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                controller.viewMode === 'list'
                  ? 'bg-white dark:bg-neutral-700 shadow'
                  : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="List view"
            >
              ☰ List
            </button>
          </div>

          {/* Provider Selection */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-600 dark:text-neutral-400">Upload to:</label>
            <select
              className="px-3 py-1.5 border rounded-lg bg-white dark:bg-neutral-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={controller.providerId || ''}
              onChange={(e) => controller.setProviderId(e.target.value || undefined)}
            >
              <option value="">Select provider…</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Folder Management */}
      {controller.folders.length > 0 && (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 bg-white dark:bg-neutral-900">
          <div className="text-xs font-medium mb-2 text-neutral-600 dark:text-neutral-400 px-1">
            Local Folders ({controller.folders.length})
          </div>
          <div className="space-y-1">
            {controller.folders.map(f => {
              const count = controller.assets.filter(a => a.folderId === f.id).length;
              return (
                <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded group">
                  <span className="text-sm">📁</span>
                  <span className="text-sm flex-1 truncate" title={f.name}>{f.name}</span>
                  <span className="text-xs text-neutral-500">{count}</span>
                  <button
                    onClick={() => controller.refreshFolder(f.id)}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-opacity"
                    title="Refresh"
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => controller.removeFolder(f.id)}
                    className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-xs hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded transition-opacity"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content Area - Different Views */}
      {controller.assets.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-6xl mb-4">📁</div>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
            {controller.folders.length === 0 ? 'No folders added yet' : 'No files found'}
          </p>
          <p className="text-sm text-neutral-500">
            {controller.folders.length === 0
              ? 'Click "Add Folder" to get started'
              : 'Added folders contain no media files'}
          </p>
        </div>
      ) : (
        <>
          {/* Tree View - Split Layout */}
          {controller.viewMode === 'tree' && (
            <div className="flex gap-4 h-[80vh]">
              {/* Left: Compact Tree Navigation */}
              <div className="w-64 flex-shrink-0 overflow-y-auto">
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

              {/* Right: Thumbnail Grid */}
              <div className="flex-1 overflow-y-auto">
                {controller.selectedFolderPath && controller.filteredAssets.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
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
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    <div className="text-center">
                      <div className="text-6xl mb-4">📂</div>
                      <p>No files in this folder</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    <div className="text-center">
                      <div className="text-6xl mb-4">👈</div>
                      <p>Select a folder from the tree</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Grid View */}
          {controller.viewMode === 'grid' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {controller.assets.map(a => (
                <div key={a.key} className="border rounded-lg overflow-hidden bg-white dark:bg-neutral-900 relative group hover:shadow-lg transition-shadow">
                  <div
                    className="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
                    onClick={() => controller.openViewer(a)}
                  >
                    {a.kind === 'image' && controller.previews[a.key] && (
                      <img src={controller.previews[a.key]} className="w-full h-full object-cover" alt={a.name} />
                    )}
                    {a.kind === 'video' && controller.previews[a.key] && (
                      <video src={controller.previews[a.key]} className="w-full h-full object-cover" muted autoPlay loop />
                    )}
                    {!controller.previews[a.key] && (
                      <div className="text-4xl opacity-50 group-hover:opacity-100 transition-opacity">
                        {a.kind === 'image' ? '🖼️' : '🎬'}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        controller.uploadOne(a.key);
                      }}
                      disabled={!controller.providerId || controller.uploadStatus[a.key] === 'uploading'}
                      className={`px-2 py-1 text-[10px] rounded-md shadow-lg font-medium transition-all ${
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
                          ? 'Upload failed'
                          : 'Upload to provider'
                      }
                    >
                      {controller.uploadStatus[a.key] === 'uploading'
                        ? '↑...'
                        : controller.uploadStatus[a.key] === 'success'
                        ? '✓'
                        : controller.uploadStatus[a.key] === 'error'
                        ? '✗'
                        : '↑'}
                    </button>
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="font-medium text-sm truncate" title={a.name}>
                      {a.name}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {a.kind} {a.size ? `• ${(a.size / 1024 / 1024).toFixed(1)} MB` : ''}
                    </div>
                    {a.relativePath.includes('/') && (
                      <div className="text-xs text-neutral-400 truncate" title={a.relativePath}>
                        📁 {a.relativePath.split('/').slice(0, -1).join('/')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {controller.viewMode === 'list' && (
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
                              <div className="text-xs">
                                {a.kind === 'image' ? '🖼️' : '🎬'}
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
                              className={`px-3 py-1 text-xs rounded font-medium ${
                                controller.uploadStatus[a.key] === 'success'
                                  ? 'bg-green-600 text-white'
                                  : controller.uploadStatus[a.key] === 'error'
                                  ? 'bg-red-600 text-white'
                                  : controller.uploadStatus[a.key] === 'uploading'
                                  ? 'bg-neutral-400 text-white'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {controller.uploadStatus[a.key] === 'uploading'
                                ? 'Uploading...'
                                : controller.uploadStatus[a.key] === 'success'
                                ? 'Uploaded ✓'
                                : controller.uploadStatus[a.key] === 'error'
                                ? 'Failed ✗'
                                : 'Upload'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

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
