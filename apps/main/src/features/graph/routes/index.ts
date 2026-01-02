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
    featured: true,
  },
};

export const graphModule: Module = {
  id: 'graph',
  name: 'Graph View',
  page: {
    route: '/graph/1',
    icon: 'graph',
    description: 'Visualize asset dependencies and relationships',
    category: 'development',
  },
};
