import { lazy } from 'react';

import type { Module } from '@app/modules/types';

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
    component: lazy(() => import('../../../routes/InteractionStudio').then(m => ({ default: m.InteractionStudio }))),
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
    component: lazy(() => import('../../../routes/InteractionComponentsDemo').then(m => ({ default: m.InteractionComponentsDemo }))),
  },
};
