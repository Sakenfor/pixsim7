import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';

import { navigateTo } from '@lib/capabilities/routeConstants';

import { DevtoolsRedirect } from '@/components/dev/DevtoolsRedirect';

import type { Module } from '@app/modules/types';

/** Open Plugin Manager action */
const openPluginManagerAction: ActionDefinition = {
  id: 'plugins.open',
  featureId: 'plugins',
  title: 'Open Plugin Manager',
  description: 'Plugin management and installation',
  icon: 'settings',
  shortcut: 'Ctrl+Shift+P',
  route: '/plugins',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/plugins');
  },
};

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
    actions: [openPluginManagerAction],
    component: lazy(() => import('../../../components/PluginManager').then(m => ({ default: m.PluginManagerUI }))),
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
    component: DevtoolsRedirect,
  },
};
