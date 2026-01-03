import { lazy } from 'react';
import type { Module } from '@app/modules/types';
import { registerGameFeature } from '@lib/capabilities/registerCoreFeatures';
import { worldToolRegistry } from '@features/worldTools';

/**
 * Game Module
 *
 * Manages interactive game world and NPC capabilities.
 * Registers game feature capabilities and ensures world tools are initialized.
 */
export const gameModule: Module = {
  id: 'game',
  name: 'Game World',

  async initialize() {
    registerGameFeature();
    // Importing worldToolRegistry ensures built-in world tools are registered.
    // The registry auto-registers built-in tools on import.
    void worldToolRegistry; // keep import used
  },

  page: {
    route: '/game-world',
    icon: 'map',
    description: 'Configure locations and hotspots for 3D scenes',
    category: 'game',
    featured: true,
    component: lazy(() => import('../../routes/GameWorld').then(m => ({ default: m.GameWorld }))),
  },
};
