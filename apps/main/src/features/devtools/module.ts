import { createElement, lazy, Suspense } from 'react';

import { defineModule } from '@app/modules/types';

const LazyAgentActivityBarWidget = lazy(() =>
  import('./components/AgentActivityBarWidget').then((m) => ({
    default: m.AgentActivityBarWidget,
  }))
);

function AgentActivityBarWidgetShell() {
  return createElement(Suspense, { fallback: null }, createElement(LazyAgentActivityBarWidget));
}

/**
 * Devtools Feature Module
 *
 * Registers the AI agent observability widget (dev-only).
 */
export const devtoolsModule = defineModule({
  id: 'devtools-module',
  name: 'DevTools Module',
  updatedAt: '2026-03-16T00:00:00Z',
  changeNote: 'AI agent observability widget for dev activity monitoring.',
  featureHighlights: ['Agent observability widget with bridge status and session count.'],

  activityBarWidgets: [
    {
      id: 'agent-status',
      order: 10,
      label: 'AI Agents (Dev)',
      icon: 'activity',
      component: AgentActivityBarWidgetShell,
    },
  ],
});
