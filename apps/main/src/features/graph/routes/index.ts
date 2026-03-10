import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement, lazy } from 'react';
import { Navigate } from 'react-router-dom';

import { ROUTES, navigateTo } from '@lib/capabilities/routeConstants';

import { defineModule } from '@app/modules/types';

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
    navigateTo('/workspace?openPanel=arc-graph');
  },
};

function ArcGraphRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=arc-graph', replace: true });
}

export const arcGraphModule = defineModule({
  id: 'arc-graph',
  name: 'Arc Graph Editor',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for arc graph route module.',
  featureHighlights: ['Arc graph route module now participates in shared latest-update metadata.'],
  page: {
    route: '/arc-graph',
    icon: 'fileText',
    iconColor: 'text-indigo-500',
    description: 'Manage story arcs, quests, and narrative flow',
    category: 'creation',
    featureId: 'graph',
    featurePrimary: true,
    featured: true,
    showInNav: false,
    component: ArcGraphRedirect,
    actions: [openArcGraphAction],
    appMap: {
      docs: ['docs/game/NPC_RESPONSE_GRAPH_DESIGN.md'],
      backend: [
        'pixsim7.backend.main.api.v1.game_scenes',
        'pixsim7.backend.main.api.v1.character_graph',
      ],
    },
  },
});

export const graphModule = defineModule({
  id: 'graph',
  name: 'Graph View',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for graph view route module.',
  featureHighlights: ['Graph view route module now participates in shared latest-update metadata.'],
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
});
