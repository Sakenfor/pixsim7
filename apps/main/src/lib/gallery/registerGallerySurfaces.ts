/**
 * Gallery Surface Registration
 *
 * Registers all available gallery surfaces with the registry.
 * Called once at application startup.
 */

import { gallerySurfaceRegistry } from './surfaceRegistry';
import { DefaultGallerySurface } from '../../components/assets/DefaultGallerySurface';
import { ReviewGallerySurface } from '../../components/assets/ReviewGallerySurface';

/**
 * Register all gallery surfaces
 *
 * This should be called once during application initialization.
 */
export function registerGallerySurfaces(): void {
  // Register the default assets surface
  gallerySurfaceRegistry.register({
    id: 'assets-default',
    label: 'Assets – Default',
    description: 'Standard asset gallery with filters and tools',
    icon: '🖼️',
    category: 'default',
    component: DefaultGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: true,
    routePath: '/assets',
  });

  // Register the review surface
  gallerySurfaceRegistry.register({
    id: 'assets-review',
    label: 'Assets – Review',
    description: 'Simplified view for reviewing and curating assets',
    icon: '✓',
    category: 'review',
    component: ReviewGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: false,
    routePath: '/assets/review',
  });

  console.log(`✓ Registered ${gallerySurfaceRegistry.count} gallery surface(s)`);

  // Verification: Check that the default surface was registered correctly
  const defaultSurface = gallerySurfaceRegistry.get('assets-default');
  if (defaultSurface) {
    console.log(`  ✓ Default surface verified: ${defaultSurface.label} (${defaultSurface.routePath})`);
  } else {
    console.error('  ✗ Failed to register default surface');
  }
}
