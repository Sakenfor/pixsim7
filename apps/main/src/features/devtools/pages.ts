import type { Module } from '@app/modules/types';

export const healthModule: Module = {
  id: 'health',
  name: 'Health Monitor',
  page: {
    route: '/health',
    icon: 'heart',
    iconColor: 'text-red-500',
    description: 'Monitor system health and job status',
    category: 'management',
    featured: true,
  },
};

export const appMapModule: Module = {
  id: 'app-map-dev',
  name: 'App Map',
  page: {
    route: '/app-map',
    icon: 'map',
    description: 'Visualize application structure and architecture',
    category: 'development',
    hidden: true,
  },
};

export const modulesDevModule: Module = {
  id: 'modules-dev',
  name: 'Modules Overview',
  page: {
    route: '/dev/modules',
    icon: 'code',
    iconColor: 'text-cyan-500',
    description: 'View all registered modules and their status',
    category: 'development',
    hidden: true,
  },
};
