/**
 * Gallery Module for Control Center
 *
 * Quick access to gallery controls:
 * - MediaCard overlay presets
 * - Surface switcher
 * - Asset stats
 * - Quick filters
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePanelConfigStore } from '@features/panels';
import type { GalleryPanelSettings } from '@features/panels';
import { useAssets } from '@features/assets';
import { mediaCardPresets } from '@lib/ui/overlay';
import { deriveOverlayPresetIdFromBadgeConfig } from '@features/gallery/lib/core/badgeConfigMerge';
import { gallerySurfaceSelectors } from '@lib/plugins/catalogSelectors';

export function GalleryModule() {
  const navigate = useNavigate();
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.gallery);
  const updatePanelSettings = usePanelConfigStore((s) => s.updatePanelSettings);

  // Get asset stats
  const { items, loading } = useAssets({ filters: {} });

  // Get current overlay preset ID, with best-effort migration from legacy badgeConfig
  const currentOverlayPresetId = useMemo(() => {
    const settings = (panelConfig?.settings || {}) as GalleryPanelSettings;
    if (settings.overlayPresetId) {
      return settings.overlayPresetId;
    }
    if (settings.badgeConfig) {
      return deriveOverlayPresetIdFromBadgeConfig(settings.badgeConfig);
    }
    return 'media-card-default';
  }, [panelConfig]);

  // Get all surfaces
  const surfaces = gallerySurfaceSelectors.getAll();

  // Asset stats by type
  const stats = useMemo(() => {
    if (loading || !items) return null;
    return {
      total: items.length,
      images: items.filter(a => a.mediaType === 'image').length,
      videos: items.filter(a => a.mediaType === 'video').length,
      audio: items.filter(a => a.mediaType === 'audio').length,
      models: items.filter(a => a.mediaType === '3d_model').length,
      ok: items.filter(a => a.providerStatus === 'ok').length,
      flagged: items.filter(a => a.providerStatus === 'flagged').length,
    };
  }, [items, loading]);

  const handleOverlayPresetChange = (presetId: string) => {
    const preset = mediaCardPresets.find(p => p.id === presetId);
    if (preset) {
      updatePanelSettings('gallery', { overlayPresetId: preset.id });
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Asset Stats */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-700">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>📊</span>
          Asset Statistics
        </h3>
        {loading ? (
          <div className="text-xs text-neutral-500">Loading...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Total:</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Images:</span>
              <span className="font-semibold">{stats.images}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Videos:</span>
              <span className="font-semibold">{stats.videos}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600 dark:text-neutral-400">Audio:</span>
              <span className="font-semibold">{stats.audio}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-600 dark:text-green-400">✓ OK:</span>
              <span className="font-semibold">{stats.ok}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-600 dark:text-red-400">⚠ Flagged:</span>
              <span className="font-semibold">{stats.flagged}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* MediaCard Preset */}
      <div>
        <h3 className="text-sm font-semibold mb-2">MediaCard Preset</h3>
        <select
          value={currentOverlayPresetId}
          onChange={(e) => handleOverlayPresetChange(e.target.value)}
          className="w-full px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {mediaCardPresets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.icon} {preset.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {mediaCardPresets.find(p => p.id === currentOverlayPresetId)?.configuration.description}
        </p>
      </div>

      {/* Gallery Surfaces */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Gallery Surfaces</h3>
        <div className="grid grid-cols-1 gap-1.5">
          {surfaces.slice(0, 5).map(surface => (
            <button
              key={surface.id}
              onClick={() => navigate(`/assets?surface=${surface.id}`)}
              className="px-2 py-1.5 text-left text-xs border border-neutral-200 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <div className="font-medium">{surface.label}</div>
              {surface.description && (
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {surface.description}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Quick Actions</h3>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => navigate('/assets')}
            className="px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
          >
            📂 Open Gallery
          </button>
          <button
            onClick={() => navigate('/assets?view=local')}
            className="px-3 py-1.5 text-sm bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded transition-colors"
          >
            💾 Local Files
          </button>
        </div>
      </div>
    </div>
  );
}
