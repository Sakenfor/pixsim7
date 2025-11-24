import type { Module } from '../types';
import { registerAssetsFeature } from '../../lib/capabilities/registerCoreFeatures';

/**
 * Assets/Gallery Module
 *
 * Manages asset library and media management capabilities.
 * Registers assets feature capabilities with the capability registry.
 */
export const assetsModule: Module = {
  id: 'assets',
  name: 'Gallery',

  async initialize() {
    registerAssetsFeature();
    // Future: Register gallery tools bootstrap if needed
  },

  page: {
    route: '/assets',
    icon: 'image',
    description: 'Browse and manage generated assets',
    category: 'creation',
    featured: true,
  },
};
