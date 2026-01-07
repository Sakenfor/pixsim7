import type { ActionDefinition } from '@shared/types';
import { lazy } from 'react';

import { navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

// === App Map Actions ===

const openAppMapAction: ActionDefinition = {
  id: 'app-map.open',
  featureId: 'app-map',
  title: 'Open App Map',
  description: 'View live app architecture and plugin ecosystem',
  icon: 'map',
  shortcut: 'Ctrl+Shift+M',
  route: '/app-map',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/app-map');
  },
};

export const healthModule: Module = {
  id: 'health',
  name: 'Health Monitor',
  page: {
    route: '/health',
    icon: 'heart',
    iconColor: 'text-red-500',
    description: 'Monitor system health and job status',
    category: 'management',
    featureId: 'health',
    showInNav: false,
    featured: true,
    // Health page is part of ControlCenter, not a standalone route
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
    featureId: 'app-map',
    featurePrimary: true,
    showInNav: true,
    hidden: true,
    component: lazy(() => import('../../../routes/AppMapDev').then(m => ({ default: m.AppMapDev }))),
    actions: [openAppMapAction],
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
    featureId: 'modules-dev',
    hidden: true,
    component: lazy(() => import('../../../routes/ModulesDev').then(m => ({ default: m.ModulesDev }))),
  },
};
