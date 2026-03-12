import { createElement, lazy, Suspense } from 'react';

import { registerState } from '@lib/capabilities';

import { defineModule } from '@app/modules/types';

const LazyGenerationActivityBarWidget = lazy(() =>
  import('./components/GenerationActivityBarWidget').then((moduleValue) => ({
    default: moduleValue.GenerationActivityBarWidget,
  }))
);

function GenerationActivityBarWidgetShell() {
  return createElement(
    Suspense,
    { fallback: null },
    createElement(LazyGenerationActivityBarWidget),
  );
}

/**
 * Register generation state capabilities.
 * States are not part of ActionDefinition and must be registered separately.
 */
async function registerGenerationState() {
  const { getGenerationSessionStore } = await import('./stores/generationScopeStores');

  registerState({
    id: 'generation.active',
    name: 'Generation Active',
    getValue: () => {
      return getGenerationSessionStore('global').getState().generating;
    },
    readonly: true,
  });
}

/**
 * Generation Module
 *
 * Manages AI-powered content generation capabilities.
 * Actions are registered via generationPageModule.page.actions
 * in routes/index.ts (Phase 1 action consolidation).
 */
export const generationModule = defineModule({
  id: 'generation',
  name: 'Generation Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for generation feature module.',
  featureHighlights: ['Generation module now participates in shared latest-update metadata.'],

  activityBarWidgets: [
    {
      id: 'generation-status',
      order: 0,
      label: 'Generations',
      icon: 'sparkles',
      component: GenerationActivityBarWidgetShell,
    },
  ],

  async initialize() {
    const [
      { registerGenerationScopes },
      { registerQuickGenerateComponentSettings },
      { registerPreviewScopes },
    ] = await Promise.all([
      import('./lib/registerGenerationScopes'),
      import('./lib/registerQuickGenerateComponentSettings'),
      import('@features/preview/lib/registerPreviewScopes'),
    ]);

    registerGenerationScopes();
    registerQuickGenerateComponentSettings();
    registerPreviewScopes();

    // Register generation state capabilities
    await registerGenerationState();
  },
});
