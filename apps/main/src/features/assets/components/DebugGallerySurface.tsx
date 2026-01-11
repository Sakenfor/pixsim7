/**
 * Debug Gallery Surface
 *
 * Developer-focused view showing technical information and diagnostics.
 */

import { useState } from 'react';

import { gallerySurfaceSelectors, galleryToolSelectors } from '@lib/plugins/catalogSelectors';

import { useAssets } from '../hooks/useAssets';

export function DebugGallerySurface() {
  const [filters] = useState({ q: '', sort: 'new' as const });
  const { items, loading, error } = useAssets({ filters });
  const [activeTab, setActiveTab] = useState<'surfaces' | 'tools' | 'assets'>('surfaces');

  // Get registry information
  const surfaces = gallerySurfaceSelectors.getAll();
  const tools = galleryToolSelectors.getAll();

  const surfaceStats = {
    total: surfaces.length,
    byCategory: surfaces.reduce((acc, s) => {
      const cat = s.category || 'unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  const toolStats = {
    total: tools.length,
    byCategory: tools.reduce((acc, t) => {
      const cat = t.category || 'unknown';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  const formatUploadContext = (context?: Record<string, unknown> | null) => {
    if (!context || Object.keys(context).length === 0) {
      return '-';
    }
    const entries = Object.entries(context)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    return entries.length > 120 ? `${entries.slice(0, 117)}...` : entries;
  };

  return (
    <div className="p-6 space-y-4 min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Gallery Debug Console</h1>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
          v1.0.0
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {['surfaces', 'tools', 'assets'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 text-sm font-medium rounded ${
              activeTab === tab
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Surfaces Tab */}
      {activeTab === 'surfaces' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-blue-500">{surfaceStats.total}</div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Surfaces</div>
            </div>
            {Object.entries(surfaceStats.byCategory).map(([cat, count]) => (
              <div key={cat} className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
                <div className="text-2xl font-bold text-green-500">{count}</div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">{cat}</div>
              </div>
            ))}
          </div>

          {/* Surface List */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-700">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Label</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Route</th>
                  <th className="text-left p-3">Selection</th>
                  <th className="text-left p-3">Hooks</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map(surface => (
                  <tr key={surface.id} className="border-t border-neutral-200 dark:border-neutral-700">
                    <td className="p-3 font-mono text-xs">{surface.id}</td>
                    <td className="p-3">{surface.icon} {surface.label}</td>
                    <td className="p-3">{surface.category}</td>
                    <td className="p-3 font-mono text-xs">{surface.routePath || '-'}</td>
                    <td className="p-3">{surface.supportsSelection ? '✓' : '✗'}</td>
                    <td className="p-3 font-mono text-xs">
                      {surface.onEnter && 'E'}{surface.onExit && 'X'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tools Tab */}
      {activeTab === 'tools' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-purple-500">{toolStats.total}</div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Total Tools</div>
            </div>
            {Object.entries(toolStats.byCategory).map(([cat, count]) => (
              <div key={cat} className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
                <div className="text-2xl font-bold text-orange-500">{count}</div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">{cat}</div>
              </div>
            ))}
          </div>

          {/* Tool List */}
          <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-700">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Category</th>
                  <th className="text-left p-3">Supported Surfaces</th>
                </tr>
              </thead>
              <tbody>
                {tools.map(tool => (
                  <tr key={tool.id} className="border-t border-neutral-200 dark:border-neutral-700">
                    <td className="p-3 font-mono text-xs">{tool.id}</td>
                    <td className="p-3">{tool.icon} {tool.name}</td>
                    <td className="p-3">{tool.category || '-'}</td>
                    <td className="p-3 font-mono text-xs">
                      {tool.supportedSurfaces?.join(', ') || 'assets-default'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-blue-500">{items.length}</div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Loaded Assets</div>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-green-500">
                {items.filter(a => a.mediaType === 'image').length}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Images</div>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-purple-500">
                {items.filter(a => a.mediaType === 'video').length}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Videos</div>
            </div>
            <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="text-2xl font-bold text-orange-500">
                {items.filter(a => a.syncStatus === 'downloaded').length}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-400">Downloaded</div>
            </div>
          </div>

          {/* Asset Details */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-4">
              <div className="font-semibold text-red-900 dark:text-red-100">Error</div>
              <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
            </div>
          )}

          {loading && (
            <div className="text-center text-neutral-500 dark:text-neutral-400">Loading...</div>
          )}

          {!loading && items.length === 0 && (
            <div className="text-center text-neutral-500 dark:text-neutral-400">No assets found</div>
          )}

          {items.length > 0 && (
            <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="bg-neutral-100 dark:bg-neutral-700 sticky top-0">
                    <tr>
                      <th className="text-left p-2">ID</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Provider</th>
                      <th className="text-left p-2">Upload Method</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Dimensions</th>
                      <th className="text-left p-2">Tags</th>
                      <th className="text-left p-2">Upload Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(asset => (
                      <tr key={asset.id} className="border-t border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-750">
                        <td className="p-2 truncate max-w-xs">{asset.id}</td>
                        <td className="p-2">{asset.mediaType}</td>
                        <td className="p-2">{asset.providerId}</td>
                        <td className="p-2">{asset.uploadMethod || '-'}</td>
                        <td className="p-2">{asset.syncStatus}</td>
                        <td className="p-2">
                          {asset.width && asset.height ? `${asset.width}x${asset.height}` : '-'}
                        </td>
                        <td className="p-2 truncate max-w-xs">{asset.tags?.map(t => t.name).join(', ') || '-'}</td>
                        <td className="p-2 truncate max-w-md">{formatUploadContext(asset.uploadContext)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
