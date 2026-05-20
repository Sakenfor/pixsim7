import { createElement, lazy, Suspense } from 'react';

import { defineModule } from '@app/modules/types';

const LazyAIAssistantWidget = lazy(() =>
  import('./domain/definitions/ai-assistant/AIAssistantActivityBarWidget').then((m) => ({
    default: m.AIAssistantActivityBarWidget,
  }))
);

function AIAssistantWidgetShell() {
  return createElement(Suspense, { fallback: null }, createElement(LazyAIAssistantWidget));
}

const LazyCommunityWidget = lazy(() =>
  import('./domain/definitions/community-hub/CommunityActivityBarWidget').then((m) => ({
    default: m.CommunityActivityBarWidget,
  }))
);

function CommunityWidgetShell() {
  return createElement(Suspense, { fallback: null }, createElement(LazyCommunityWidget));
}

/**
 * Panels Feature Module
 *
 * Registers user-facing activity bar widgets.
 */
export const panelsModule = defineModule({
  id: 'panels-module',
  name: 'Panels Module',
  updatedAt: '2026-03-16T00:00:00Z',
  changeNote: 'AI Assistant activity bar widget for all users.',
  featureHighlights: ['AI assistant chat accessible from activity bar.'],

  activityBarWidgets: [
    {
      id: 'ai-assistant',
      order: 5,
      label: 'AI Assistant',
      icon: 'messageSquare',
      component: AIAssistantWidgetShell,
    },
    {
      id: 'community-chat',
      order: 6,
      label: 'Community Chat',
      icon: 'users',
      component: CommunityWidgetShell,
    },
  ],
});
