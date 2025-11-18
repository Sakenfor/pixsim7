/**
 * Cube Formation V1 Plugin
 *
 * Original cube-based control center with multiple formation patterns.
 * Features: arc, circle, grid, constellation, dock, scattered formations.
 */

import type { ControlCenterPluginManifest, ControlCenterPlugin } from '../../../lib/plugins/controlCenterPlugin';
import { controlCenterRegistry } from '../../../lib/plugins/controlCenterPlugin';
import { CubeFormationControlCenter } from '../../../components/control/CubeFormationControlCenter';
import { useControlCenterStore } from '../../../stores/controlCenterStore';

export const manifest: ControlCenterPluginManifest = {
  id: 'cube-formation-v1',
  name: 'Cube Formation Control Center V1',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Animated cube formation system with multiple patterns and spatial organization',
  icon: '🎲',

  type: 'ui-overlay',

  permissions: [
    'ui:overlay',
    'storage',
  ],

  main: 'plugin.ts',

  controlCenter: {
    id: 'cubes-v1',
    displayName: 'Cube Formation (Original)',
    description: 'Spatial cube system with 6 formation patterns and drag-and-drop',
    features: [
      '6 Formations',
      'Animated',
      'Draggable',
      'Standalone cubes',
      'Panel minimization',
      'Keyboard shortcuts',
    ],
  },
};

export const plugin: ControlCenterPlugin = {
  render() {
    return <CubeFormationControlCenter />;
  },

  open() {
    useControlCenterStore.getState().setOpen(true);
  },

  close() {
    useControlCenterStore.getState().setOpen(false);
  },

  toggle() {
    useControlCenterStore.getState().toggleOpen();
  },

  setModule(module: string) {
    useControlCenterStore.getState().setActiveModule(module as any);
  },

  cleanup() {
    console.log('[CubeFormationV1] Cleanup');
  },
};

// Auto-register when imported
controlCenterRegistry.register(manifest, plugin);
