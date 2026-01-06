import type { ActionDefinition } from '@shared/types';
import { lazy } from 'react';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import { worldToolRegistry } from '@features/worldTools';

import type { Module } from '@app/modules/types';

// === Game Actions ===

const enterGameWorldAction: ActionDefinition = {
  id: 'game.enter-world',
  featureId: 'game',
  title: 'Enter Game World',
  description: 'Open the game world',
  icon: 'map',
  route: ROUTES.GAME_WORLD,
  execute: () => {
    navigateTo(ROUTES.GAME_WORLD);
  },
};

const openNpcEditorAction: ActionDefinition = {
  id: 'game.npc-editor',
  featureId: 'game',
  title: 'NPC Editor',
  description: 'Open the NPC brain lab',
  icon: 'brain',
  route: ROUTES.NPC_BRAIN_LAB,
  execute: () => {
    navigateTo(ROUTES.NPC_BRAIN_LAB);
  },
};

/**
 * Game Module
 *
 * Manages interactive game world and NPC capabilities.
 * Actions are registered automatically via page.actions.
 */
export const gameModule: Module = {
  id: 'game',
  name: 'Game World',

  async initialize() {
    // Importing worldToolRegistry ensures built-in world tools are registered.
    // The registry auto-registers built-in tools on import.
    void worldToolRegistry; // keep import used
  },

  page: {
    route: '/game-world',
    icon: 'map',
    description: 'Configure locations and hotspots for 3D scenes',
    category: 'game',
    featureId: 'game',
    featured: true,
    component: lazy(() => import('../../routes/GameWorld').then(m => ({ default: m.GameWorld }))),
    actions: [enterGameWorldAction, openNpcEditorAction],
  },
};
