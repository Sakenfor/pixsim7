import type { Module } from '../types';
import { registerAssetsFeature } from '../../lib/capabilities/registerCoreFeatures';

/**
 * Assets/Gallery Module
 *
 * Manages asset library and media management capabilities.
 * Registers assets feature capabilities with the capability registry.
 *
 * Note: Context menu data for assets is registered at the component level
 * using useRegisterContextData() - no module-level resolver needed.
 */
export const assetsModule: Module = {
  id: 'assets',
  name: 'Gallery',

  async initialize() {
    registerAssetsFeature();
  },

  page: {
    route: '/assets',
    icon: 'image',
    description: 'Browse and manage generated assets',
    category: 'creation',
    featured: true,
  },
};
