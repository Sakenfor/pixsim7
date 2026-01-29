import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

// === Graph Actions ===

const openArcGraphAction: ActionDefinition = {
  id: 'graph.open-arc-graph',
  featureId: 'graph',
  title: 'Open Arc Graph',
  description: 'Open the arc graph editor',
  icon: 'fileText',
  route: ROUTES.ARC_GRAPH,
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo(ROUTES.ARC_GRAPH);
  },
};

export const arcGraphModule: Module = {
  id: 'arc-graph',
  name: 'Arc Graph Editor',
  page: {
    route: '/arc-graph',
    icon: 'fileText',
    iconColor: 'text-indigo-500',
    description: 'Manage story arcs, quests, and narrative flow',
    category: 'creation',
    featureId: 'graph',
    featurePrimary: true,
    featured: true,
    component: lazy(() => import('../../../routes/ArcGraph').then(m => ({ default: m.ArcGraphRoute }))),
    actions: [openArcGraphAction],
    appMap: {
      docs: ['docs/game/NPC_RESPONSE_GRAPH_DESIGN.md'],
      backend: [
        'pixsim7.backend.main.api.v1.action_blocks',
        'pixsim7.backend.main.api.v1.game_scenes',
        'pixsim7.backend.main.api.v1.character_graph',
      ],
    },
  },
};

export const graphModule: Module = {
  id: 'graph',
  name: 'Graph View',
  page: {
    route: '/graph/:id',
    icon: 'graph',
    description: 'Visualize asset dependencies and relationships',
    category: 'development',
    featureId: 'graph',
    showInNav: false,
    featurePrimary: false,
    component: lazy(() => import('../../../routes/Graph').then(m => ({ default: m.GraphRoute }))),
  },
};
