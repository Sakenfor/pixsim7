import { lazy } from 'react';
import type { Module } from '@app/modules/types';

export const pluginWorkspaceModule: Module = {
  id: 'plugin-workspace',
  name: 'Plugin Workspace',
  page: {
    route: '/plugin-workspace',
    icon: 'settings',
    description: 'Manage and develop plugins',
    category: 'development',
    hidden: true,
    component: lazy(() => import('../../../routes/PluginWorkspace').then(m => ({ default: m.PluginWorkspaceRoute }))),
  },
};
