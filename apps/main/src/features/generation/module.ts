import { registerState } from '@lib/capabilities';

import { defineModule } from '@app/modules/types';

import { GenerationActivityBarWidget } from './components/GenerationActivityBarWidget';
import { getGenerationSessionStore } from './stores/generationScopeStores';

/**
 * Register generation state capabilities.
 * States are not part of ActionDefinition and must be registered separately.
 */
function registerGenerationState() {
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
      component: GenerationActivityBarWidget,
    },
  ],

  async initialize() {
    // Register generation state capabilities
    registerGenerationState();
    // Future: Register generation UI plugins / provider hooks if needed
  },
});
