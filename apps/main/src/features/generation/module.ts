import { registerState } from '@lib/capabilities';

import type { Module } from '@app/modules/types';

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
export const generationModule: Module = {
  id: 'generation',
  name: 'Generation Module',

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
};
