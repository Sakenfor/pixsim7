import { useEffect, useMemo, useState } from 'react';
import { useLocalFolders } from '../../stores/localFoldersStore';
import { useProviders } from '../../hooks/useProviders';
import { TreeFolderView } from './TreeFolderView';
import { MediaViewerCube } from './MediaViewerCube';
import type { LocalAsset } from '../../stores/localFoldersStore';

async function fileToObjectURL(fh: FileSystemFileHandle): Promise<string | undefined> {
  try { const f = await fh.getFile(); return URL.createObjectURL(f); } catch { return undefined; }
}

type ViewMode = 'grid' | 'tree' | 'list';

export function LocalFoldersPanel() {
  const { supported, folders, assets, loadPersisted, addFolder, removeFolder, refreshFolder, adding, error } = useLocalFolders();
  const { providers } = useProviders();
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadNotes, setUploadNotes] = useState<Record<string, string | undefined>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [selectedFolder, setSelectedFolder] = useState<string | undefined>(undefined);
  const [viewerAsset, setViewerAsset] = useState<LocalAsset | null>(null);

  useEffect(() => { loadPersisted(); }, []);

  const assetList = useMemo(() => {
    const list = Object.values(assets);
    // Filter by selected folder if any
    const filtered = selectedFolder ? list.filter(a => a.folderId === selectedFolder) : list;
    return filtered.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
  }, [assets, selectedFolder]);

  async function preview(keyOrAsset: string | LocalAsset) {
    const asset = typeof keyOrAsset === 'string' ? assets[keyOrAsset] : keyOrAsset;
    if (!asset) return;
    if (previews[asset.key]) return;
    const url = await fileToObjectURL(asset.fileHandle);
    if (url) setPreviews(p => ({ ...p, [asset.key]: url }));
  }

  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({});

  async function uploadOne(keyOrAsset: string | LocalAsset) {
    const asset = typeof keyOrAsset === 'string' ? assets[keyOrAsset] : keyOrAsset;
    if (!asset) return;
    if (!providerId) { alert('Select a provider'); return; }
    setUploadStatus(s => ({ ...s, [asset.key]: 'uploading' }));
    try {
      const file = await asset.fileHandle.getFile();
      const form = new FormData();
      form.append('file', file, asset.name);
      form.append('provider_id', providerId);
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

      // Get auth token from localStorage
      const token = localStorage.getItem('access_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/upload`, {
        method: 'POST',
        body: form,
        headers
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }
      const data = await res.json().catch(() => ({}));
      setUploadNotes(n => ({ ...n, [asset.key]: data?.note }));
      setUploadStatus(s => ({ ...s, [asset.key]: 'success' }));
    } catch (e: any) {
      setUploadStatus(s => ({ ...s, [asset.key]: 'error' }));
    }
  }

  const totalSize = useMemo(() => {
    return assetList.reduce((sum, a) => sum + (a.size || 0), 0);
  }, [assetList]);

  const stats = useMemo(() => {
    const images = assetList.filter(a => a.kind === 'image').length;
    const videos = assetList.filter(a => a.kind === 'video').length;
    return { images, videos, total: assetList.length };
  }, [assetList]);

  const handleOpenViewer = async (asset: LocalAsset) => {
    // Ensure preview is loaded
    await preview(asset);
    setViewerAsset(asset);
  };

  const handleCloseViewer = () => {
    setViewerAsset(null);
  };

  const handleNavigateViewer = (direction: 'prev' | 'next') => {
    if (!viewerAsset) return;
    const currentIndex = assetList.findIndex(a => a.key === viewerAsset.key);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < assetList.length) {
      const newAsset = assetList[newIndex];
      preview(newAsset);
      setViewerAsset(newAsset);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          className="px-4 py-2 border rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors font-medium"
          onClick={addFolder}
          disabled={adding || !supported}
        >
          {adding ? '📂 Adding...' : '📂 Add Folder'}
        </button>

        {!supported && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
            ⚠️ Your browser does not support local folder access. Use Chrome/Edge.
          </div>
        )}
        {error && (
          <div className="px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewMode === 'tree'
                  ? 'bg-white dark:bg-neutral-700 shadow'
                  : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="Tree view"
            >
              🌳 Tree
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-neutral-700 shadow'
                  : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
              title="Grid view"
            >
              ⊞ Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs rounded transition-colors ${
                viewMode === 'list'
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
              value={providerId || ''}
              onChange={(e) => setProviderId(e.target.value || undefined)}
            >
              <option value="">Select provider…</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {assetList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.total}</div>
            <div className="text-xs text-blue-600 dark:text-blue-500">Total Files</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.images}</div>
            <div className="text-xs text-purple-600 dark:text-purple-500">Images</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.videos}</div>
            <div className="text-xs text-green-600 dark:text-green-500">Videos</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">
              {(totalSize / 1024 / 1024).toFixed(1)}
            </div>
            <div className="text-xs text-orange-600 dark:text-orange-500">MB Total</div>
          </div>
        </div>
      )}

      {/* Folders List */}
      {folders.length > 0 && (
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
          <div className="text-sm font-medium mb-2 text-neutral-700 dark:text-neutral-300">Active Folders:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFolder(undefined)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${
                !selectedFolder
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-blue-500'
              }`}
            >
              All Folders ({Object.keys(assets).length})
            </button>
            {folders.map(f => {
              const count = Object.values(assets).filter(a => a.folderId === f.id).length;
              return (
                <div key={f.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedFolder(f.id)}
                    className={`px-3 py-1.5 text-sm rounded-l-lg border transition-all ${
                      selectedFolder === f.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:border-blue-500'
                    }`}
                  >
                    📁 {f.name} ({count})
                  </button>
                  <button
                    onClick={() => refreshFolder(f.id)}
                    className="px-2 py-1.5 text-sm border-t border-b bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 transition-colors"
                    title="Refresh folder"
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => {
                      if (selectedFolder === f.id) setSelectedFolder(undefined);
                      removeFolder(f.id);
                    }}
                    className="px-2 py-1.5 text-sm rounded-r-lg border-t border-r border-b bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
                    title="Remove folder"
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
      {assetList.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-6xl mb-4">📁</div>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-2">
            {folders.length === 0 ? 'No folders added yet' : 'No files found'}
          </p>
          <p className="text-sm text-neutral-500">
            {folders.length === 0
              ? 'Click "Add Folder" to get started'
              : selectedFolder
              ? 'This folder contains no media files'
              : 'Add folders with images or videos'}
          </p>
        </div>
      ) : (
        <>
          {/* Tree View */}
          {viewMode === 'tree' && (
            <TreeFolderView
              assets={assetList}
              folderId={selectedFolder}
              onFileClick={handleOpenViewer}
              onPreview={preview}
              previews={previews}
              uploadStatus={uploadStatus}
              onUpload={uploadOne}
              providerId={providerId}
            />
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {assetList.map(a => (
                <div key={a.key} className="border rounded-lg overflow-hidden bg-white dark:bg-neutral-900 relative group hover:shadow-lg transition-shadow">
                  <div
                    className="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
                    onClick={() => handleOpenViewer(a)}
                  >
                    {a.kind === 'image' && previews[a.key] && (
                      <img src={previews[a.key]} className="w-full h-full object-cover" alt={a.name} />
                    )}
                    {a.kind === 'video' && previews[a.key] && (
                      <video src={previews[a.key]} className="w-full h-full object-cover" muted autoPlay loop />
                    )}
                    {!previews[a.key] && (
                      <div className="text-4xl opacity-50 group-hover:opacity-100 transition-opacity">
                        {a.kind === 'image' ? '🖼️' : '🎬'}
                      </div>
                    )}
                  </div>
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        uploadOne(a.key);
                      }}
                      disabled={!providerId || uploadStatus[a.key] === 'uploading'}
                      className={`px-2 py-1 text-[10px] rounded-md shadow-lg font-medium transition-all ${
                        uploadStatus[a.key] === 'success'
                          ? 'bg-green-600 text-white'
                          : uploadStatus[a.key] === 'error'
                          ? 'bg-red-600 text-white'
                          : uploadStatus[a.key] === 'uploading'
                          ? 'bg-neutral-400 text-white'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                      title={
                        uploadStatus[a.key] === 'success'
                          ? uploadNotes[a.key] || 'Uploaded successfully'
                          : uploadStatus[a.key] === 'error'
                          ? 'Upload failed'
                          : 'Upload to provider'
                      }
                    >
                      {uploadStatus[a.key] === 'uploading'
                        ? '↑...'
                        : uploadStatus[a.key] === 'success'
                        ? '✓'
                        : uploadStatus[a.key] === 'error'
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
          {viewMode === 'list' && (
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
                    {assetList.map(a => (
                      <tr key={a.key} className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
                        <td className="p-3">
                          <div
                            className="w-16 h-12 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center overflow-hidden cursor-pointer"
                            onClick={() => handleOpenViewer(a)}
                          >
                            {previews[a.key] ? (
                              a.kind === 'image' ? (
                                <img src={previews[a.key]} className="w-full h-full object-cover" alt={a.name} />
                              ) : (
                                <video src={previews[a.key]} className="w-full h-full object-cover" muted />
                              )
                            ) : (
                              <div className="text-xs">
                                {a.kind === 'image' ? '🖼️' : '🎬'}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-medium cursor-pointer hover:text-blue-600" onClick={() => handleOpenViewer(a)}>
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
                            {!previews[a.key] && (
                              <button
                                onClick={() => preview(a.key)}
                                className="px-2 py-1 text-xs border rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              >
                                Preview
                              </button>
                            )}
                            <button
                              onClick={() => uploadOne(a.key)}
                              disabled={!providerId || uploadStatus[a.key] === 'uploading'}
                              className={`px-3 py-1 text-xs rounded font-medium ${
                                uploadStatus[a.key] === 'success'
                                  ? 'bg-green-600 text-white'
                                  : uploadStatus[a.key] === 'error'
                                  ? 'bg-red-600 text-white'
                                  : uploadStatus[a.key] === 'uploading'
                                  ? 'bg-neutral-400 text-white'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                            >
                              {uploadStatus[a.key] === 'uploading'
                                ? 'Uploading...'
                                : uploadStatus[a.key] === 'success'
                                ? 'Uploaded ✓'
                                : uploadStatus[a.key] === 'error'
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
      {viewerAsset && (
        <MediaViewerCube
          asset={viewerAsset}
          assetUrl={previews[viewerAsset.key]}
          allAssets={assetList}
          onClose={handleCloseViewer}
          onNavigate={handleNavigateViewer}
        />
      )}
    </div>
  );
}
