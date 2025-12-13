/**
 * Default Gallery Surface
 *
 * Wraps the standard AssetsRoute as a gallery surface.
 */

import { AssetsRoute } from '@/routes/Assets';

/**
 * Default gallery surface component
 *
 * This is the standard asset gallery view with all features:
 * - Grid/masonry layout
 * - Full filtering and search
 * - All gallery tools
 * - Asset selection
 */
export function DefaultGallerySurface() {
  return <AssetsRoute />;
}
