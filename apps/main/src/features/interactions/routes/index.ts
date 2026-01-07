import type { ActionDefinition } from '@shared/types';
import { lazy } from 'react';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

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
    navigateTo(ROUTES.INTERACTION_STUDIO);
  },
};

export const interactionStudioModule: Module = {
  id: 'interaction-studio',
  name: 'Interaction Studio',
  page: {
    route: '/interaction-studio',
    icon: 'sparkles',
    iconColor: 'text-yellow-500',
    description: 'Design and prototype NPC interactions visually',
    category: 'game',
    featureId: 'interactions',
    featurePrimary: true,
    component: lazy(() => import('../../../routes/InteractionStudio').then(m => ({ default: m.InteractionStudio }))),
    actions: [openInteractionStudioAction],
  },
};

export const interactionDemoModule: Module = {
  id: 'interaction-demo',
  name: 'Interaction Demo',
  page: {
    route: '/interaction-demo',
    icon: 'play',
    iconColor: 'text-green-500',
    description: 'See all interaction components in action with live examples',
    category: 'development',
    featureId: 'interaction-demo',
    component: lazy(() => import('../../../routes/InteractionComponentsDemo').then(m => ({ default: m.InteractionComponentsDemo }))),
  },
};
