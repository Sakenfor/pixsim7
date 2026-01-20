import type { ActionDefinition } from '@pixsim7/shared.types';
import { lazy } from 'react';

import { navigateTo } from '@lib/capabilities/routeConstants';

import type { Module } from '@app/modules/types';

/**
 * Automation Module
 *
 * Manages workflow automation and scheduling capabilities.
 * Actions are registered automatically via page.actions.
 */

/** Open Automation action - navigates to automation page */
const openAutomationAction: ActionDefinition = {
  id: 'automation.open',
  featureId: 'automation',
  title: 'Open Automation',
  description: 'Manage Android devices and automation loops',
  icon: 'bot',
  route: '/automation',
  contexts: ['background'],
  category: 'quick-add',
  execute: () => {
    navigateTo('/automation');
  },
};

export const automationModule: Module = {
  id: 'automation',
  name: 'Automation',

  page: {
    route: '/automation',
    icon: 'bot',
    description: 'Manage Android devices and automation loops',
    category: 'automation',
    featureId: 'automation',
    featured: true,
    component: lazy(() => import('../../routes/Automation').then(m => ({ default: m.AutomationRoute }))),
    actions: [openAutomationAction],
  },
};
