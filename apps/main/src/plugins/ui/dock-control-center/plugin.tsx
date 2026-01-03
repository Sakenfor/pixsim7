/**
 * Dock Control Center Plugin
 *
 * Traditional sliding panel control center - the default interface.
 * Familiar, lightweight, and works on all edges (bottom, top, left, right, floating).
 */

import type { ControlCenterPluginManifest, ControlCenterPlugin } from '@lib/plugins/controlCenterPlugin';

import { ControlCenterDock } from '@features/controlCenter/components/ControlCenterDock';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

export const manifest: ControlCenterPluginManifest = {
  id: 'dock-control-center',
  name: 'Dock Control Center',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Traditional sliding panel interface with multi-position docking',
  icon: '🪟',

  type: 'ui-overlay',

  permissions: [
    'ui:overlay',
    'storage',
  ],

  main: 'plugin.tsx',

  controlCenter: {
    id: 'dock',
    displayName: 'Dock Mode',
    description: 'Traditional sliding panel that can dock to any edge or float',
    default: true, // This is the default control center
    features: [
      'Multi-position',
      'Floating mode',
      'Keyboard resize',
      'Auto-hide',
      'Lightweight',
    ],
  },
};

export const plugin: ControlCenterPlugin = {
  render() {
    return <ControlCenterDock />;
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
    // Cleanup if needed
    console.log('[DockControlCenter] Cleanup');
  },
};

export async function registerDockControlCenter(): Promise<void> {
  const { controlCenterRegistry } = await import('@lib/plugins/controlCenterPlugin');
  controlCenterRegistry.register(manifest, plugin);
}
