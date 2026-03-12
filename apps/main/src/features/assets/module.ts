import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';

import { registerState } from '@lib/capabilities';
import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import { getAllAssetSources } from '@features/gallery/lib/core/assetSources';

import { moduleRegistry } from '@app/modules';
import { defineModule } from '@app/modules/types';

// === Assets Actions ===

const openGalleryAction: ActionDefinition = {
  id: 'assets.open-gallery',
  featureId: 'assets',
  title: 'Open Gallery',
  description: 'Open the asset gallery',
  icon: 'image',
  shortcut: 'Ctrl+Shift+A',
  route: ROUTES.ASSETS,
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo(ROUTES.ASSETS);
  },
};

const uploadAssetAction: ActionDefinition = {
  id: 'assets.upload',
  featureId: 'assets',
  title: 'Upload Asset',
  description: 'Upload a new asset',
  icon: 'upload',
  execute: async () => {
    // TODO: Open upload dialog
    console.log('Upload asset');
  },
};

const searchAssetsAction: ActionDefinition = {
  id: 'assets.search',
  featureId: 'assets',
  title: 'Search Assets',
  description: 'Search for assets',
  icon: 'search',
  shortcut: 'Ctrl+K',
  execute: () => {
    // TODO: Open search
    console.log('Search assets');
  },
};

/**
 * Register assets state capabilities.
 * States are not part of ActionDefinition and must be registered separately.
 */
function registerAssetsState() {
  registerState({
    id: 'assets.count',
    name: 'Asset Count',
    getValue: () => {
      // TODO: Get from assets store
      return 0;
    },
    readonly: true,
  });
}

/**
 * Assets/Gallery Module
 *
 * Manages asset library and media management capabilities.
 * Actions are registered automatically via page.actions.
 *
 * Note: Context menu data for assets is registered at the component level
 * using useRegisterContextData() - no module-level resolver needed.
 */
export const assetsModule = defineModule({
  id: 'assets',
  name: 'Gallery',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for assets/gallery feature wiring.',
  featureHighlights: ['Assets module now participates in shared latest-update metadata.'],

  async initialize() {
    const [{ registerAssetSources }, { registerGallerySurfaces }, { registerGalleryTools }] =
      await Promise.all([
        import('@features/gallery/lib/core/registerAssetSources'),
        import('@features/gallery/lib/core/registerGallerySurfaces'),
        import('@features/gallery/lib/core/registerGalleryTools'),
      ]);

    // Register assets state capabilities
    registerAssetsState();

    // Register gallery surfaces/tools and asset sources so gallery UI is ready on demand.
    await Promise.all([
      registerGallerySurfaces(),
      registerGalleryTools(),
      registerAssetSources(),
    ]);
    moduleRegistry.invalidate();
  },

  page: {
    route: '/assets',
    icon: 'image',
    description: 'Browse and manage generated assets',
    category: 'creation',
    capabilityCategory: 'management',
    featureId: 'assets',
    featured: true,
    subNav: () => getAllAssetSources().map((src) => ({
      id: src.id,
      label: src.label,
      icon: src.icon,
      param: { key: 'source', value: src.id },
    })),
    settingsPanelId: 'gallery',
    component: lazy(() => import('../../routes/Assets').then(m => ({ default: m.AssetsRoute }))),
    actions: [openGalleryAction, uploadAssetAction, searchAssetsAction],
    appMap: {
      backend: [
        'pixsim7.backend.main.api.v1.assets',
        'pixsim7.backend.main.api.v1.assets_bulk',
        'pixsim7.backend.main.api.v1.assets_tags',
        'pixsim7.backend.main.api.v1.assets_versions',
        'pixsim7.backend.main.api.v1.assets_maintenance',
        'pixsim7.backend.main.services.asset',
      ],
    },
  },
});
