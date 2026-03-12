import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import { defineModule } from '@app/modules/types';

// === Game Actions ===

const enterGameWorldAction: ActionDefinition = {
  id: 'game.enter-world',
  featureId: 'game',
  title: 'Enter Game World',
  description: 'Open the game world',
  icon: 'map',
  route: ROUTES.GAME_WORLD,
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/workspace?openPanel=game-world');
  },
};

const openNpcEditorAction: ActionDefinition = {
  id: 'game.npc-editor',
  featureId: 'game',
  title: 'NPC Editor',
  description: 'Open the NPC brain lab',
  icon: 'brain',
  route: ROUTES.NPC_BRAIN_LAB,
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/workspace?openPanel=npc-brain-lab');
  },
};

function GameWorldRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=game-world', replace: true });
}

/**
 * Game Module
 *
 * Manages interactive game world and NPC capabilities.
 * Actions are registered automatically via page.actions.
 */
export const gameModule = defineModule({
  id: 'game',
  name: 'Game World',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for game world feature module.',
  featureHighlights: ['Game world module now participates in shared latest-update metadata.'],
  dependsOn: ['workspace'],

  async initialize() {
    const { registerWorldTools } = await import('@features/worldTools/lib/registerWorldTools');
    await registerWorldTools();
  },

  page: {
    route: '/game-world',
    icon: 'map',
    description: 'Configure locations and hotspots for 3D scenes',
    category: 'game',
    featureId: 'game',
    featured: true,
    showInNav: false,
    component: GameWorldRedirect,
    actions: [enterGameWorldAction, openNpcEditorAction],
    appMap: {
      docs: ['docs/backend/game.md'],
      backend: [
        'pixsim7.backend.main.api.v1.game_worlds',
        'pixsim7.backend.main.api.v1.game_sessions',
        'pixsim7.backend.main.domain.game',
      ],
    },
  },
});
