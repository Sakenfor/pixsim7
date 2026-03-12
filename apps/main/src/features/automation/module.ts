import type { ActionDefinition } from '@pixsim7/shared.types';
import { createElement } from 'react';
import { Navigate } from 'react-router-dom';

import { navigateTo } from '@lib/capabilities/routeConstants';

import { defineModule } from '@app/modules/types';

/**
 * Automation Module
 *
 * Manages workflow automation and scheduling capabilities.
 * Actions are registered automatically via page.actions.
 */

/** Open Automation action - navigates to automation panel in workspace */
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
    navigateTo('/workspace?openPanel=automation');
  },
};

function AutomationRedirect() {
  return createElement(Navigate, { to: '/workspace?openPanel=automation', replace: true });
}

export const automationModule = defineModule({
  id: 'automation',
  name: 'Automation',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for automation feature module.',
  featureHighlights: ['Automation module now participates in shared latest-update metadata.'],
  dependsOn: ['workspace'],

  page: {
    route: '/automation',
    icon: 'bot',
    description: 'Manage Android devices and automation loops',
    category: 'automation',
    featureId: 'automation',
    featured: true,
    showInNav: false,
    component: AutomationRedirect,
    actions: [openAutomationAction],
    appMap: {
      docs: ['docs/backend/automation.md'],
      backend: [
        'pixsim7.backend.main.api.v1.automation',
        'pixsim7.backend.main.api.v1.device_agents',
        'pixsim7.backend.main.services.automation',
      ],
    },
  },
});
