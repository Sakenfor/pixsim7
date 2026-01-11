/**
 * Gallery Surface Registration
 *
 * Registers all available gallery surfaces with the registry.
 * Called once at application startup.
 */

import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import {
  DefaultGallerySurface,
  ReviewGallerySurface,
  CuratorGallerySurface,
  DebugGallerySurface,
} from '@features/assets';

import { gallerySurfaceRegistry } from './surfaceRegistry';

const builtInGallerySurfaces = [
  {
    id: 'assets-default',
    label: 'Assets – Default',
    description: 'Standard asset gallery with filters and tools',
    icon: '🖼️',
    category: 'default',
    component: DefaultGallerySurface,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: true,
    routePath: '/assets',
  },
  {
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
      console.log('[GallerySurfaces] Review mode activated - Use A/R/S keys for quick review');
    },
    onExit: () => {
      console.log('[GallerySurfaces] Exiting review mode');
    },
  },
  {
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
      console.log('[GallerySurfaces] Curator mode - Advanced tools enabled');
    },
  },
  {
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
      console.log('[GallerySurfaces] Debug mode - System diagnostics enabled');
    },
  },
];

/**
 * Register all gallery surfaces
 *
 * This should be called once during application initialization.
 */
export async function registerGallerySurfaces(): Promise<void> {
  for (const surface of builtInGallerySurfaces) {
    if (!gallerySurfaceRegistry.get(surface.id)) {
      await registerPluginDefinition({
        id: surface.id,
        family: 'gallery-surface',
        origin: 'builtin',
        source: 'source',
        plugin: surface,
        canDisable: false,
      });
    }
  }

  console.log(`[GallerySurfaces] Registered ${gallerySurfaceRegistry.count} gallery surface(s)`);

  // Verification: Check that the default surface was registered correctly
  const defaultSurface = gallerySurfaceRegistry.get('assets-default');
  if (defaultSurface) {
    console.log(`[GallerySurfaces] Default surface verified: ${defaultSurface.label} (${defaultSurface.routePath})`);
  } else {
    console.error('[GallerySurfaces] Failed to register default surface');
  }
}
