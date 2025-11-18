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
  name: 'Assets / Gallery Module',

  async initialize() {
    registerAssetsFeature();
    // Future: Register gallery tools bootstrap if needed
  },
};
