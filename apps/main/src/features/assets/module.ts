import type { ActionDefinition } from '@shared/types';
import { lazy } from 'react';

import { useCapabilityStore } from '@lib/capabilities';
import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

// === Assets Actions ===

const openGalleryAction: ActionDefinition = {
  id: 'assets.open-gallery',
  featureId: 'assets',
  title: 'Open Gallery',
  description: 'Open the asset gallery',
  icon: 'image',
  shortcut: 'Ctrl+Shift+A',
  route: ROUTES.ASSETS,
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
  const store = useCapabilityStore.getState();

  store.registerState({
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
export const assetsModule: Module = {
  id: 'assets',
  name: 'Gallery',

  async initialize() {
    // Register assets state capabilities
    registerAssetsState();
  },

  page: {
    route: '/assets',
    icon: 'image',
    description: 'Browse and manage generated assets',
    category: 'creation',
    capabilityCategory: 'management',
    featureId: 'assets',
    featured: true,
    component: lazy(() => import('../../routes/Assets').then(m => ({ default: m.AssetsRoute }))),
    actions: [openGalleryAction, uploadAssetAction, searchAssetsAction],
  },
};
