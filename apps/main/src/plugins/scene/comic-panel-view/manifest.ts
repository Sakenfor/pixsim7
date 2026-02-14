/**
 * Comic Panel View Plugin Manifest
 *
 * Defines metadata and configuration for the comic panel scene view plugin.
 */

import type { SceneViewPluginManifest } from '@lib/plugins/sceneViewPlugin';

export const manifest: SceneViewPluginManifest = {
  id: 'scene-view:comic-panels',
  name: 'Comic Panel View',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Displays scene beats as sequential comic frames with optional captions',
  type: 'ui-overlay',
  family: 'scene',
  icon: '📚',
  permissions: ['ui:overlay', 'read:session', 'read:world'],
  main: 'plugin.js', // Build output entry point
  sceneView: {
    id: 'scene-view:comic-panels',
    displayName: 'Comic Panels',
    description: 'Sequential comic-style frames for scene playback',
    surfaces: ['overlay', 'hud', 'panel'],
    contentTypes: ['comic-panels'],
    default: true,
  },
};
