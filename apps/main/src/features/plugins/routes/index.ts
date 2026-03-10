import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';

import { navigateTo } from '@lib/capabilities/routeConstants';

import { defineModule } from '@app/modules/types';

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

export const pluginManagerModule = defineModule({
  id: 'plugin-manager',
  name: 'Plugins',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for plugin manager route module.',
  featureHighlights: ['Plugin manager route module now participates in shared latest-update metadata.'],
  page: {
    route: '/plugins',
    icon: 'settings',
    description: 'Plugin management and installation',
    category: 'management',
    capabilityCategory: 'utility',
    featureId: 'plugins',
    featurePrimary: true,
    protected: true,
    hidden: true,
    actions: [openPluginManagerAction],
    component: lazy(() => import('../../../components/PluginManager').then(m => ({ default: m.PluginManagerUI }))),
    appMap: {
      docs: [
        'docs/systems/plugins/PLUGIN_SYSTEM.md',
        'docs/systems/plugins/PLUGIN_DEVELOPER_GUIDE.md',
      ],
      backend: [
        'pixsim7.backend.main.api.v1.plugins',
        'pixsim7.backend.main.infrastructure.plugins',
      ],
    },
  },
});
