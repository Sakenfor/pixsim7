import type { Module } from '@app/modules/types';
import { registerGenerationFeature } from '@lib/capabilities/registerCoreFeatures';

/**
 * Generation Module
 *
 * Manages AI-powered content generation capabilities.
 * Registers generation feature capabilities with the capability registry.
 */
export const generationModule: Module = {
  id: 'generation',
  name: 'Generation Module',

  async initialize() {
    registerGenerationFeature();
    // Future: Register generation UI plugins / provider hooks if needed
  },
};
