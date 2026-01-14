import type { ActionDefinition } from '@shared/types';

import { navigateTo } from '@lib/capabilities/routeConstants';

import { DevtoolsRedirect } from '@/components/dev/DevtoolsRedirect';

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
    component: DevtoolsRedirect,
    actions: [openAppMapAction],
    devTool: {
      category: 'graph',
      tags: ['architecture', 'map', 'visualization', 'structure'],
    },
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
    component: DevtoolsRedirect,
  },
};

export const templateAnalyticsModule: Module = {
  id: 'template-analytics',
  name: 'Template Analytics',
  page: {
    route: '/template-analytics',
    icon: 'bar-chart',
    iconColor: 'text-purple-500',
    description: 'Analyze template usage and performance metrics',
    category: 'development',
    featureId: 'template-analytics',
    hidden: true,
    component: DevtoolsRedirect,
    devTool: {
      category: 'debug',
      tags: ['templates', 'analytics', 'metrics', 'performance'],
    },
  },
};

export const promptInspectorModule: Module = {
  id: 'prompt-inspector',
  name: 'Prompt Inspector',
  page: {
    route: '/dev/prompt-inspector',
    icon: 'search',
    iconColor: 'text-yellow-500',
    description: 'Inspect and debug prompts sent to LLM providers',
    category: 'development',
    featureId: 'prompt-inspector',
    hidden: true,
    component: DevtoolsRedirect,
  },
};

export const promptImporterModule: Module = {
  id: 'prompt-importer',
  name: 'Prompt Importer',
  page: {
    route: '/dev/prompt-importer',
    icon: 'upload',
    iconColor: 'text-green-500',
    description: 'Import prompts from external sources',
    category: 'development',
    featureId: 'prompt-importer',
    hidden: true,
    component: DevtoolsRedirect,
  },
};

export const promptLabModule: Module = {
  id: 'prompt-lab',
  name: 'Prompt Lab',
  page: {
    route: '/dev/prompt-lab',
    icon: 'flask',
    iconColor: 'text-pink-500',
    description: 'Experiment with prompt variations and test outputs',
    category: 'development',
    featureId: 'prompt-lab',
    hidden: true,
    component: DevtoolsRedirect,
  },
};

export const actionBlockGraphModule: Module = {
  id: 'action-block-graph',
  name: 'Action Block Graph',
  page: {
    route: '/dev/action-block-graph',
    icon: 'git-branch',
    iconColor: 'text-orange-500',
    description: 'Visualize and debug action block dependencies',
    category: 'development',
    featureId: 'action-block-graph',
    hidden: true,
    component: DevtoolsRedirect,
  },
};

export const blockFitModule: Module = {
  id: 'block-fit',
  name: 'Block Fit',
  page: {
    route: '/dev/block-fit',
    icon: 'grid',
    iconColor: 'text-teal-500',
    description: 'Test block layout fitting algorithms',
    category: 'development',
    featureId: 'block-fit',
    hidden: true,
    component: DevtoolsRedirect,
  },
};

export const widgetBuilderModule: Module = {
  id: 'widget-builder',
  name: 'Widget Builder',
  page: {
    route: '/dev/widget-builder',
    icon: 'layout',
    iconColor: 'text-blue-500',
    description: 'Visual editor for creating and configuring widgets',
    category: 'development',
    featureId: 'widget-builder',
    hidden: true,
    component: DevtoolsRedirect,
  },
};
