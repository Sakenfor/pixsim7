import { lazy } from 'react';

import type { Module } from '@app/modules/types';

export const pluginManagerModule: Module = {
  id: 'plugin-manager',
  name: 'Plugins',
  page: {
    route: '/plugins',
    icon: 'settings',
    description: 'Plugin management and installation',
    category: 'management',
    capabilityCategory: 'utility',
    featureId: 'plugins',
    featurePrimary: true,
    protected: true,
    showInNav: true,
  },
};

export const pluginWorkspaceModule: Module = {
  id: 'plugin-workspace',
  name: 'Plugin Workspace',
  page: {
    route: '/plugin-workspace',
    icon: 'settings',
    description: 'Manage and develop plugins',
    category: 'development',
    featureId: 'plugin-workspace',
    hidden: true,
    component: lazy(() => import('../../../routes/PluginWorkspace').then(m => ({ default: m.PluginWorkspaceRoute }))),
  },
};
