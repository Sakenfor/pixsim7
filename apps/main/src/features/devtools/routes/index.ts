import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';

import { navigateTo } from '@lib/capabilities/routeConstants';
import { buildDevtoolsUrl } from '@lib/dev/devtools/devtoolsUrl';

import { DevtoolsRedirect } from '@/components/dev/DevtoolsRedirect';

import type { Module } from '@app/modules/types';

function openDevtools(path: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(buildDevtoolsUrl(path));
    return;
  }
  navigateTo('/devtools');
}

const openDevtoolsAction: ActionDefinition = {
  id: 'devtools.open',
  featureId: 'devtools',
  title: 'Open DevTools',
  description: 'Open the dedicated developer tools workspace',
  icon: 'code',
  shortcut: 'Ctrl+Shift+M',
  route: '/devtools',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    openDevtools('/');
  },
};

const openCodegenAction: ActionDefinition = {
  id: 'codegen.open',
  featureId: 'codegen',
  title: 'Open Codegen',
  description: 'Run and verify workspace code generation tasks',
  icon: 'code',
  route: '/devtools',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    openDevtools('/dev/codegen');
  },
};

const DevtoolsGatewayRedirect = () => createElement(DevtoolsRedirect, { preservePath: false });

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
    hidden: true,
  },
};

export const devtoolsGatewayModule: Module = {
  id: 'devtools-gateway',
  name: 'Developer Tools',
  page: {
    route: '/devtools',
    icon: 'code',
    iconColor: 'text-cyan-500',
    description: 'Open the dedicated Developer Tools workspace',
    category: 'development',
    featureId: 'devtools',
    hidden: true,
    component: DevtoolsGatewayRedirect,
    actions: [openDevtoolsAction, openCodegenAction],
  },
};
