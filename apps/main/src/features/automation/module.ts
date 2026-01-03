import { lazy } from 'react';
import type { Module } from '@app/modules/types';
import { registerAutomationFeature } from '@lib/capabilities/registerCoreFeatures';

/**
 * Automation Module
 *
 * Manages workflow automation and scheduling capabilities.
 * Registers automation feature capabilities with the capability registry.
 */
export const automationModule: Module = {
  id: 'automation',
  name: 'Automation',

  async initialize() {
    registerAutomationFeature();
  },

  page: {
    route: '/automation',
    icon: 'bot',
    description: 'Manage Android devices and automation loops',
    category: 'automation',
    featured: true,
    component: lazy(() => import('../../routes/Automation').then(m => ({ default: m.AutomationRoute }))),
  },
};
