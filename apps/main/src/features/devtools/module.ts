import type { Module } from '@app/modules/types';
import { registerAppMapFeature } from '@lib/capabilities/registerCoreFeatures';

/**
 * App Map Module
 *
 * Dev tools module for visualizing app architecture, features, and plugins.
 * Provides live view of capability registry and plugin catalog.
 */
export const appMapModule: Module = {
  id: 'app-map',
  name: 'App Map Module',

  async initialize() {
    registerAppMapFeature();
  },
};
