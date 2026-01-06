import { lazy } from 'react';

import { registerAssetsActions } from '@lib/capabilities/registerCoreFeatures';

import type { Module } from '@app/modules/types';

/**
 * Assets/Gallery Module
 *
 * Manages asset library and media management capabilities.
 * Registers assets actions and state with the capability registry.
 *
 * Note: Context menu data for assets is registered at the component level
 * using useRegisterContextData() - no module-level resolver needed.
 */
export const assetsModule: Module = {
  id: 'assets',
  name: 'Gallery',

  async initialize() {
    registerAssetsActions();
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
  },
};
