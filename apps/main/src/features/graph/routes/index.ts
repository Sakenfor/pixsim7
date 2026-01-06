import { lazy } from 'react';

import type { Module } from '@app/modules/types';

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
    featured: true,
    component: lazy(() => import('../../../routes/ArcGraph').then(m => ({ default: m.ArcGraphRoute }))),
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
    component: lazy(() => import('../../../routes/Graph').then(m => ({ default: m.GraphRoute }))),
  },
};
