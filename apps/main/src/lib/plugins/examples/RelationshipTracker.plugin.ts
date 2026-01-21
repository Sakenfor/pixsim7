/**
 * Example plugin manifest for the Relationship Tracker demo
 */
import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  id: 'relationship-tracker',
  name: 'Relationship Tracker',
  version: '1.0.0',
  description: 'Displays NPC relationship scores in an overlay',
  author: 'PixSim Team',
  family: 'ui',
  type: 'ui-overlay',
  permissions: ['ui:overlay', 'read:session'],
  main: 'index.js',
};
