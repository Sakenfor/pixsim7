/**
 * Gallery Surface Host
 *
 * Dynamically renders the active gallery surface based on URL parameter or store.
 */

import { useMemo } from 'react';
import { gallerySurfaceRegistry, type GallerySurfaceId } from '../../lib/gallery/surfaceRegistry';

interface GallerySurfaceHostProps {
  /** Surface ID to render (if not provided, uses URL param or default) */
  surfaceId?: GallerySurfaceId;
}

/**
 * Gallery Surface Host Component
 *
 * Fetches the surface definition from the registry and renders its component.
 */
export function GallerySurfaceHost({ surfaceId: propSurfaceId }: GallerySurfaceHostProps) {
  // Determine active surface ID from props, URL, or default
  const activeSurfaceId = useMemo(() => {
    if (propSurfaceId) return propSurfaceId;

    // Try to get from URL parameter
    const params = new URLSearchParams(window.location.search);
    const urlSurfaceId = params.get('surface');
    if (urlSurfaceId) return urlSurfaceId as GallerySurfaceId;

    // Fall back to default
    const defaultSurface = gallerySurfaceRegistry.getDefault();
    return defaultSurface?.id || 'assets-default';
  }, [propSurfaceId]);

  // Get surface definition from registry
  const surface = gallerySurfaceRegistry.get(activeSurfaceId);

  if (!surface) {
    return (
      <div className="p-6 space-y-4">
        <div className="text-red-600 text-sm">
          Surface "{activeSurfaceId}" not found in registry.
        </div>
        <div className="text-sm text-neutral-600">
          Available surfaces: {gallerySurfaceRegistry.getAll().map(s => s.id).join(', ')}
        </div>
      </div>
    );
  }

  // Render the surface component
  const SurfaceComponent = surface.component;

  return (
    <div className="gallery-surface-host" data-surface-id={surface.id}>
      <SurfaceComponent />
    </div>
  );
}
