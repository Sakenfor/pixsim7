import { lazy } from 'react';

import { registerAutomationActions } from '@lib/capabilities/registerCoreFeatures';

import type { Module } from '@app/modules/types';

/**
 * Automation Module
 *
 * Manages workflow automation and scheduling capabilities.
 * Registers automation actions with the capability registry.
 */
export const automationModule: Module = {
  id: 'automation',
  name: 'Automation',

  async initialize() {
    registerAutomationActions();
  },

  page: {
    route: '/automation',
    icon: 'bot',
    description: 'Manage Android devices and automation loops',
    category: 'automation',
    featureId: 'automation',
    featured: true,
    component: lazy(() => import('../../routes/Automation').then(m => ({ default: m.AutomationRoute }))),
  },
};
