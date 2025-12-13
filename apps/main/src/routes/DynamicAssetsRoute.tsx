/**
 * Dynamic Assets Route
 *
 * Wrapper around AssetsRoute that enables dynamic surface switching without page reload.
 */

import { useState, useEffect } from 'react';
import { gallerySurfaceRegistry, GallerySurfaceSwitcher } from '@features/gallery';
import { AssetsRoute } from './Assets';
import { ReviewGallerySurface } from '../components/assets/ReviewGallerySurface';

export function DynamicAssetsRoute() {
  // Get initial surface from URL
  const [activeSurfaceId, setActiveSurfaceId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('surface') || 'assets-default';
  });

  //Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const surfaceId = params.get('surface') || 'assets-default';
      setActiveSurfaceId(surfaceId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Get the surface definition
  const surface = gallerySurfaceRegistry.get(activeSurfaceId);

  if (!surface) {
    return (
      <div className="p-6">
        <div className="text-red-600">Unknown surface: {activeSurfaceId}</div>
      </div>
    );
  }

  // Render appropriate surface
  const SurfaceComponent = surface.component;

  return <SurfaceComponent />;
}
