import { registerGenerationActions } from '@lib/capabilities/registerCoreFeatures';

import type { Module } from '@app/modules/types';

/**
 * Generation Module
 *
 * Manages AI-powered content generation capabilities.
 * Registers generation actions with the capability registry.
 */
export const generationModule: Module = {
  id: 'generation',
  name: 'Generation Module',

  async initialize() {
    registerGenerationActions();
    // Future: Register generation UI plugins / provider hooks if needed
  },
};
