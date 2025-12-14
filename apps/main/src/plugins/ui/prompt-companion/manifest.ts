/**
 * Prompt Companion Plugin Manifest
 *
 * Declares plugin metadata for the unified plugin system.
 */

import type { PluginMetadata } from '@lib/plugins/pluginSystem';

export const promptCompanionManifest: PluginMetadata = {
  id: 'prompt-companion',
  name: 'Prompt Companion',
  family: 'ui-plugin',
  origin: 'builtin',
  activationState: 'active',
  canDisable: true,
  version: '1.0.0',
  description:
    'Interactive toolbar for prompt input surfaces. Provides block analysis, variant suggestions, and semantic pack hints.',
  author: 'PixSim7 Team',
  tags: ['prompt', 'companion', 'toolbar', 'analysis', 'dev-tools'],
};
