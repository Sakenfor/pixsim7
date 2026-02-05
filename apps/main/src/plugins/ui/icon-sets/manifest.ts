/**
 * Icon Sets Plugin Manifest
 *
 * Declares plugin metadata for the unified plugin system.
 */

import type { PluginMetadata } from '@lib/plugins/pluginSystem';

export const iconSetsManifest: PluginMetadata = {
  id: 'icon-sets',
  name: 'Icon Sets',
  family: 'ui-plugin',
  origin: 'builtin',
  activationState: 'active',
  canDisable: true,
  version: '1.0.0',
  description: 'Registers optional icon sets for the UI.',
  author: 'PixSim7 Team',
  tags: ['icons', 'ui', 'appearance'],
};
