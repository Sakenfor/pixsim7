/**
 * Core Capability Registration
 *
 * Registers actions and state capabilities for core features.
 * Feature and route metadata are derived from module page definitions.
 */

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

import { ROUTES, navigateTo } from './routeConstants';

import { useCapabilityStore } from './index';

/**
 * Assets/Gallery Actions
 */
export function registerAssetsActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'assets.open-gallery',
    name: 'Open Gallery',
    description: 'Open the asset gallery',
    icon: '📦',
    shortcut: 'Ctrl+Shift+A',
    featureId: 'assets',
    execute: () => {
      navigateTo(ROUTES.ASSETS);
    },
  });
  store.registerAction({
    id: 'assets.upload',
    name: 'Upload Asset',
    description: 'Upload a new asset',
    icon: '📤',
    featureId: 'assets',
    execute: async () => {
      // TODO: Open upload dialog
      console.log('Upload asset');
    },
  });
  store.registerAction({
    id: 'assets.search',
    name: 'Search Assets',
    description: 'Search for assets',
    icon: '🔍',
    shortcut: 'Ctrl+K',
    featureId: 'assets',
    execute: () => {
      // TODO: Open search
      console.log('Search assets');
    },
  });

  store.registerState({
    id: 'assets.count',
    name: 'Asset Count',
    getValue: () => {
      // TODO: Get from assets store
      return 0;
    },
    readonly: true,
  });
}

// Workspace capability registration has been moved to @features/workspace
export { registerWorkspaceActions } from '@features/workspace';

/**
 * Content Generation Actions
 */
export function registerGenerationActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'generation.quick-generate',
    name: 'Quick Generate',
    icon: '⚡',
    shortcut: 'Ctrl+G',
    featureId: 'generation',
    execute: () => {
      // Open quick generate in control center
      useControlCenterStore.getState().setActiveModule('quickGenerate');
      useControlCenterStore.getState().setOpen(true);
    },
  });
  store.registerAction({
    id: 'generation.open-presets',
    name: 'Open Presets',
    icon: '🎨',
    featureId: 'generation',
    execute: () => {
      useControlCenterStore.getState().setActiveModule('presets');
      useControlCenterStore.getState().setOpen(true);
    },
  });
  store.registerAction({
    id: 'generation.select-provider',
    name: 'Select Provider',
    icon: '🌐',
    featureId: 'generation',
    execute: () => {
      useControlCenterStore.getState().setActiveModule('providers');
      useControlCenterStore.getState().setOpen(true);
    },
  });

  store.registerState({
    id: 'generation.active',
    name: 'Generation Active',
    getValue: () => {
      return useControlCenterStore.getState().generating;
    },
    readonly: true,
  });
}

/**
 * Game Actions
 */
export function registerGameActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'game.enter-world',
    name: 'Enter Game World',
    icon: '🌍',
    featureId: 'game',
    execute: () => {
      navigateTo(ROUTES.GAME_WORLD);
    },
  });
  store.registerAction({
    id: 'game.npc-editor',
    name: 'NPC Editor',
    icon: '🧠',
    featureId: 'game',
    execute: () => {
      navigateTo(ROUTES.NPC_BRAIN_LAB);
    },
  });
}

/**
 * Automation Actions
 */
export function registerAutomationActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'automation.open',
    name: 'Open Automation',
    icon: '⚡',
    featureId: 'automation',
    execute: () => {
      navigateTo(ROUTES.AUTOMATION);
    },
  });
}

/**
 * Plugin Manager Actions
 */
export function registerPluginsActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'plugins.open',
    name: 'Open Plugin Manager',
    icon: '🔌',
    shortcut: 'Ctrl+Shift+P',
    featureId: 'plugins',
    execute: () => {
      navigateTo(ROUTES.PLUGINS);
    },
  });
}

/**
 * App Map Actions
 */
export function registerAppMapActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'app-map.open',
    name: 'Open App Map',
    description: 'View live app architecture and plugin ecosystem',
    icon: '🗺️',
    shortcut: 'Ctrl+Shift+M',
    featureId: 'app-map',
    execute: () => {
      navigateTo('/app-map');
    },
  });
}

/**
 * Graph Actions (Arc Graph)
 */
export function registerGraphActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'graph.open-arc-graph',
    name: 'Open Arc Graph',
    description: 'Open the arc graph editor',
    icon: '📝',
    featureId: 'graph',
    execute: () => {
      navigateTo(ROUTES.ARC_GRAPH);
    },
  });
}

/**
 * Interactions Actions (Interaction Studio)
 */
export function registerInteractionsActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'interactions.open-studio',
    name: 'Open Interaction Studio',
    description: 'Open the interaction studio',
    icon: '💬',
    featureId: 'interactions',
    execute: () => {
      navigateTo(ROUTES.INTERACTION_STUDIO);
    },
  });
}

/**
 * Gizmos Actions (Gizmo Lab)
 */
export function registerGizmosActions() {
  const store = useCapabilityStore.getState();

  store.registerAction({
    id: 'gizmos.open-lab',
    name: 'Open Gizmo Lab',
    description: 'Open the gizmo lab',
    icon: '🔧',
    featureId: 'gizmos',
    execute: () => {
      navigateTo(ROUTES.GIZMO_LAB);
    },
  });
}
