/**
 * Gallery Surface Registration
 *
 * Registers all available gallery surfaces with the registry.
 * Called once at application startup.
 */

import { gallerySurfaceRegistry } from './surfaceRegistry';
import { DefaultGallerySurface } from '../../components/assets/DefaultGallerySurface';
import { ReviewGallerySurface } from '../../components/assets/ReviewGallerySurface';
import { CuratorGallerySurface } from '../../components/assets/CuratorGallerySurface';
import { DebugGallerySurface } from '../../components/assets/DebugGallerySurface';

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
    onEnter: () => {
      console.log('👁️ Review mode activated - Use A/R/S keys for quick review');
    },
    onExit: () => {
      console.log('👋 Exiting review mode');
    },
  });

  // Register the curator surface
  gallerySurfaceRegistry.register({
    id: 'assets-curator',
    label: 'Assets – Curator',
    description: 'Advanced curation tools for power users',
    icon: '⭐',
    category: 'curation',
    component: CuratorGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: true,
    routePath: '/assets/curator',
    defaultTools: ['bulk-tag'],
    onEnter: () => {
      console.log('⭐ Curator mode - Advanced tools enabled');
    },
  });

  // Register the debug surface
  gallerySurfaceRegistry.register({
    id: 'assets-debug',
    label: 'Assets – Debug',
    description: 'Developer tools and diagnostics',
    icon: '🐛',
    category: 'debug',
    component: DebugGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: false,
    routePath: '/assets/debug',
    onEnter: () => {
      console.log('🐛 Debug mode - System diagnostics enabled');
    },
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
