import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement, lazy } from 'react';
import { Navigate } from 'react-router-dom';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import { defineModule } from '@app/modules/types';

// === Interactions Actions ===

const openInteractionStudioAction: ActionDefinition = {
  id: 'interactions.open-studio',
  featureId: 'interactions',
  title: 'Open Interaction Studio',
  description: 'Open the interaction studio',
  icon: 'sparkles',
  route: ROUTES.INTERACTION_STUDIO,
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/workspace?openPanel=interaction-studio');
  },
};

function InteractionStudioRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=interaction-studio', replace: true });
}

export const interactionStudioModule = defineModule({
  id: 'interaction-studio',
  name: 'Interaction Studio',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for interaction studio route module.',
  featureHighlights: ['Interaction studio route module now participates in shared latest-update metadata.'],
  page: {
    route: '/interaction-studio',
    icon: 'sparkles',
    iconColor: 'text-yellow-500',
    description: 'Design and prototype NPC interactions visually',
    category: 'game',
    featureId: 'interactions',
    featurePrimary: true,
    showInNav: false,
    component: InteractionStudioRedirect,
    actions: [openInteractionStudioAction],
    appMap: {
      docs: [
        'docs/narrative/INTERACTION_AUTHORING_GUIDE.md',
        'docs/game/INTERACTION_PLUGIN_MANIFEST.md',
      ],
      backend: [
        'pixsim7.backend.main.api.v1.npc_interactions',
        'pixsim7.backend.main.api.v1.npc_state',
        'pixsim7.backend.main.domain.game.interactions',
      ],
    },
  },
});

export const interactionDemoModule = defineModule({
  id: 'interaction-demo',
  name: 'Interaction Demo',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for interaction demo route module.',
  featureHighlights: ['Interaction demo route module now participates in shared latest-update metadata.'],
  page: {
    route: '/interaction-demo',
    icon: 'play',
    iconColor: 'text-green-500',
    description: 'See all interaction components in action with live examples',
    category: 'development',
    featureId: 'interaction-demo',
    component: lazy(() => import('../../../routes/InteractionComponentsDemo').then(m => ({ default: m.InteractionComponentsDemo }))),
  },
});
