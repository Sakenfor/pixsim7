/**
 * Gallery Surface Switcher
 *
 * Allows switching between different gallery surfaces.
 */

import { useState, useEffect } from 'react';
import { gallerySurfaceSelectors } from '@lib/plugins/catalogSelectors';
import type { GallerySurfaceId } from '../lib/core/surfaceRegistry';

interface GallerySurfaceSwitcherProps {
  /** Current active surface ID */
  activeSurfaceId?: GallerySurfaceId;

  /** Callback when surface changes */
  onSurfaceChange?: (surfaceId: GallerySurfaceId) => void;

  /** Display mode */
  mode?: 'dropdown' | 'tabs';
}

/**
 * Gallery Surface Switcher Component
 *
 * Renders a UI for switching between registered gallery surfaces.
 */
export function GallerySurfaceSwitcher({
  activeSurfaceId,
  onSurfaceChange,
  mode = 'dropdown',
}: GallerySurfaceSwitcherProps) {
  const [currentSurfaceId, setCurrentSurfaceId] = useState<GallerySurfaceId>(() => {
    if (activeSurfaceId) return activeSurfaceId;

    // Try to get from URL
    const params = new URLSearchParams(window.location.search);
    const urlSurfaceId = params.get('surface');
    if (urlSurfaceId) return urlSurfaceId as GallerySurfaceId;

    // Fall back to default
    const defaultSurface = gallerySurfaceSelectors.getDefault();
    return defaultSurface?.id || 'assets-default';
  });

  const surfaces = gallerySurfaceSelectors.getAll();

  useEffect(() => {
    if (activeSurfaceId) {
      setCurrentSurfaceId(activeSurfaceId);
    }
  }, [activeSurfaceId]);

  const handleSurfaceChange = (surfaceId: GallerySurfaceId) => {
    setCurrentSurfaceId(surfaceId);

    // Update URL parameter
    const params = new URLSearchParams(window.location.search);
    params.set('surface', surfaceId);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.pushState({}, '', newUrl);

    // Trigger callback which will cause parent to re-render with new surface
    if (onSurfaceChange) {
      onSurfaceChange(surfaceId);
    } else {
      // If no callback provided, force a reload as fallback
      window.location.reload();
    }
  };

  if (surfaces.length <= 1) {
    // Don't show switcher if there's only one surface
    return null;
  }

  if (mode === 'tabs') {
    return (
      <div className="flex gap-1 border border-neutral-200 dark:border-neutral-700 rounded p-1 bg-neutral-50 dark:bg-neutral-800">
        {surfaces.map(surface => (
          <button
            key={surface.id}
            onClick={() => handleSurfaceChange(surface.id)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              currentSurfaceId === surface.id
                ? 'bg-blue-500 text-white'
                : 'bg-transparent text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
            }`}
            title={surface.description}
          >
            {surface.icon && <span className="mr-1">{surface.icon}</span>}
            {surface.label}
          </button>
        ))}
      </div>
    );
  }

  // Dropdown mode
  const currentSurface = surfaces.find(s => s.id === currentSurfaceId);

  return (
    <div className="relative inline-block">
      <select
        value={currentSurfaceId}
        onChange={(e) => handleSurfaceChange(e.target.value as GallerySurfaceId)}
        className="px-3 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
      >
        {surfaces.map(surface => (
          <option key={surface.id} value={surface.id}>
            {surface.icon} {surface.label}
          </option>
        ))}
      </select>

      {/* Current surface indicator */}
      {currentSurface && (
        <div className="absolute -bottom-5 left-0 right-0 text-[9px] text-center text-neutral-400">
          {currentSurface.category}
        </div>
      )}
    </div>
  );
}
