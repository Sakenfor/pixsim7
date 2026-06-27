/**
 * Dock Control Center Plugin
 *
 * Traditional sliding panel control center - the default interface.
 * Familiar, lightweight, and works on all edges (bottom, top, left, right, floating).
 */

import { lazy, Suspense } from 'react';

import type { ControlCenterPluginManifest, ControlCenterPlugin } from '@lib/plugins/controlCenterPlugin';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import type { ControlModule } from '@features/controlCenter/stores/controlCenterStore';

const LazyControlCenterDock = lazy(() =>
  import('@features/controlCenter/components/ControlCenterDock').then((module) => ({
    default: module.ControlCenterDock,
  }))
);

async function setDockOpen(open: boolean): Promise<void> {
  const [{ useDockUiStore }, { DOCK_IDS }] = await Promise.all([
    import('@features/docks/stores'),
    import('@features/panels/lib/panelIds'),
  ]);
  useDockUiStore.getState().setDockOpen(DOCK_IDS.controlCenter, open);
}

async function toggleDockOpen(): Promise<void> {
  const [{ useDockUiStore }, { DOCK_IDS }] = await Promise.all([
    import('@features/docks/stores'),
    import('@features/panels/lib/panelIds'),
  ]);
  useDockUiStore.getState().toggleDockOpen(DOCK_IDS.controlCenter);
}

async function setActiveControlCenterModule(module: string): Promise<void> {
  const { useControlCenterStore } = await import('@features/controlCenter/stores/controlCenterStore');
  useControlCenterStore.getState().setActiveModule(module as ControlModule);
}

export const manifest: ControlCenterPluginManifest = {
  id: 'dock-control-center',
  name: 'Dock Control Center',
  version: '1.0.0',
  author: 'PixSim7 Team',
  description: 'Traditional sliding panel interface with multi-position docking',
  family: 'control-center',
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
    return (
      <Suspense fallback={null}>
        <LazyControlCenterDock />
      </Suspense>
    );
  },

  open() {
    void setDockOpen(true);
  },

  close() {
    void setDockOpen(false);
  },

  toggle() {
    void toggleDockOpen();
  },

  setModule(module: string) {
    void setActiveControlCenterModule(module);
  },

  cleanup() {
    // Cleanup if needed
    console.log('[DockControlCenter] Cleanup');
  },
};

export async function registerDockControlCenter(): Promise<void> {
  await registerPluginDefinition({
    id: manifest.id,
    family: 'control-center',
    origin: 'builtin',
    source: 'source',
    plugin: { manifest, plugin },
    canDisable: false,
  });
}
