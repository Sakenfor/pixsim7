/**
 * Gallery Surface Registration
 *
 * Registers all available gallery surfaces with the plugin catalog.
 * Called once at application startup.
 *
 * Note: Non-default surfaces are now rendered inline by RemoteGallerySource
 * based on the ?surface= URL parameter. The component refs here are kept
 * for the plugin registry (metadata, lifecycle hooks, etc.) but are not
 * used for rendering.
 */

import { gallerySurfaceSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import {
  ReviewSurfaceContent,
  CuratorSurfaceContent,
  DebugSurfaceContent,
  SignalTriageContent,
} from '@features/assets';

const builtInGallerySurfaces = [
  {
    id: 'assets-default',
    label: 'Assets – Default',
    description: 'Standard asset gallery with filters and tools',
    icon: '🖼️',
    category: 'default',
    // No component needed — this is the default rendering path in RemoteGallerySource
    component: () => null,
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
    component: ReviewSurfaceContent,
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
    component: CuratorSurfaceContent,
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
    component: DebugSurfaceContent,
    supportsMediaTypes: ['image', 'video', 'audio', '3d_model'],
    supportsSelection: false,
    routePath: '/assets/debug',
    onEnter: () => {
      console.log('[GallerySurfaces] Debug mode - System diagnostics enabled');
    },
  },
  {
    id: 'assets-signal-triage',
    label: 'Assets – Signal Triage',
    description: 'Validate the broken-video heuristic. Keep / Flag overrides the score.',
    icon: '⚠️',
    category: 'review',
    component: SignalTriageContent,
    supportsMediaTypes: ['video'],
    supportsSelection: false,
    routePath: '/assets/signal-triage',
  },
];

/**
 * Register all gallery surfaces
 *
 * This should be called once during application initialization.
 */
export async function registerGallerySurfaces(): Promise<void> {
  for (const surface of builtInGallerySurfaces) {
    if (!gallerySurfaceSelectors.get(surface.id)) {
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

  console.log(`[GallerySurfaces] Registered ${gallerySurfaceSelectors.count} gallery surface(s)`);

  // Verification: Check that the default surface was registered correctly
  const defaultSurface = gallerySurfaceSelectors.get('assets-default');
  if (defaultSurface) {
    console.log(`[GallerySurfaces] Default surface verified: ${defaultSurface.label} (${defaultSurface.routePath})`);
  } else {
    console.error('[GallerySurfaces] Failed to register default surface');
  }
}
