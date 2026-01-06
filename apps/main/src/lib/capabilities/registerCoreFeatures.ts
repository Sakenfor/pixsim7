/**
 * Core Feature Registration
 *
 * Individual registration functions for core app features.
 * Each function registers a feature's capabilities (routes, actions, states)
 * in the capability registry so plugins can discover and interact with them.
 *
 * These functions are called by their respective modules during initialization.
 */

import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';

import { ROUTES, navigateTo } from './routeConstants';

import { registerCompleteFeature } from './index';

/**
 * Assets/Gallery Feature
 */
export function registerAssetsFeature() {
  registerCompleteFeature({
    feature: {
      id: 'assets',
      name: 'Assets',
      description: 'Asset library and media management',
      icon: '📦',
      category: 'management',
      priority: 90,
      enabled: () => true,
    },
    routes: [
      {
        path: ROUTES.ASSETS,
        name: 'Asset Gallery',
        description: 'Browse all assets',
        icon: '📦',
        protected: true,
        showInNav: true,
      },
      {
        path: ROUTES.ASSET_DETAIL,
        name: 'Asset Detail',
        description: 'View asset details',
        icon: '🔍',
        protected: true,
        showInNav: false,
      },
    ],
    actions: [
      {
        id: 'assets.open-gallery',
        name: 'Open Gallery',
        description: 'Open the asset gallery',
        icon: '📦',
        shortcut: 'Ctrl+Shift+A',
        execute: () => {
          navigateTo(ROUTES.ASSETS);
        },
      },
      {
        id: 'assets.upload',
        name: 'Upload Asset',
        description: 'Upload a new asset',
        icon: '📤',
        execute: async () => {
          // TODO: Open upload dialog
          console.log('Upload asset');
        },
      },
      {
        id: 'assets.search',
        name: 'Search Assets',
        description: 'Search for assets',
        icon: '🔍',
        shortcut: 'Ctrl+K',
        execute: () => {
          // TODO: Open search
          console.log('Search assets');
        },
      },
    ],
    states: [
      {
        id: 'assets.count',
        name: 'Asset Count',
        getValue: () => {
          // TODO: Get from assets store
          return 0;
        },
        readonly: true,
      },
    ],
  });
}

// Workspace feature registration has been moved to @features/workspace
export { registerWorkspaceFeature } from '@features/workspace';

/**
 * Content Generation Feature
 */
export function registerGenerationFeature() {
  registerCompleteFeature({
    feature: {
      id: 'generation',
      name: 'Generation',
      description: 'AI-powered content generation',
      icon: '✨',
      category: 'creation',
      priority: 100,
    },
    routes: [
      {
        path: ROUTES.GENERATE,
        name: 'Generate',
        description: 'Quick generation interface',
        icon: '✨',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'generation.quick-generate',
        name: 'Quick Generate',
        icon: '⚡',
        shortcut: 'Ctrl+G',
        execute: () => {
          // Open quick generate in control center
          useControlCenterStore.getState().setActiveModule('quickGenerate');
          useControlCenterStore.getState().setOpen(true);
        },
      },
      {
        id: 'generation.open-presets',
        name: 'Open Presets',
        icon: '🎨',
        execute: () => {
          useControlCenterStore.getState().setActiveModule('presets');
          useControlCenterStore.getState().setOpen(true);
        },
      },
      {
        id: 'generation.select-provider',
        name: 'Select Provider',
        icon: '🌐',
        execute: () => {
          useControlCenterStore.getState().setActiveModule('providers');
          useControlCenterStore.getState().setOpen(true);
        },
      },
    ],
    states: [
      {
        id: 'generation.active',
        name: 'Generation Active',
        getValue: () => {
          return useControlCenterStore.getState().generating;
        },
        readonly: true,
      },
    ],
  });
}

/**
 * Game Features
 */
export function registerGameFeature() {
  registerCompleteFeature({
    feature: {
      id: 'game',
      name: 'Game',
      description: 'Interactive game world and NPCs',
      icon: '🎮',
      category: 'game',
      priority: 70,
    },
    routes: [
      {
        path: ROUTES.GAME_WORLD,
        name: 'Game World',
        icon: '🌍',
        protected: true,
        showInNav: true,
      },
      {
        path: ROUTES.GAME_2D,
        name: '2D Game',
        icon: '🎮',
        protected: true,
        showInNav: true,
      },
      {
        path: ROUTES.NPC_PORTRAITS,
        name: 'NPC Portraits',
        icon: '👤',
        protected: true,
        showInNav: true,
      },
      {
        path: ROUTES.NPC_BRAIN_LAB,
        name: 'NPC Brain Lab',
        icon: '🧠',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'game.enter-world',
        name: 'Enter Game World',
        icon: '🌍',
        execute: () => {
          navigateTo(ROUTES.GAME_WORLD);
        },
      },
      {
        id: 'game.npc-editor',
        name: 'NPC Editor',
        icon: '🧠',
        execute: () => {
          navigateTo(ROUTES.NPC_BRAIN_LAB);
        },
      },
    ],
  });
}

/**
 * Automation Feature
 */
export function registerAutomationFeature() {
  registerCompleteFeature({
    feature: {
      id: 'automation',
      name: 'Automation',
      description: 'Workflow automation and scheduling',
      icon: '⚡',
      category: 'utility',
      priority: 60,
    },
    routes: [
      {
        path: ROUTES.AUTOMATION,
        name: 'Automation',
        icon: '⚡',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'automation.open',
        name: 'Open Automation',
        icon: '⚡',
        execute: () => {
          navigateTo(ROUTES.AUTOMATION);
        },
      },
    ],
  });
}

/**
 * Plugin Manager Feature
 */
export function registerPluginsFeature() {
  registerCompleteFeature({
    feature: {
      id: 'plugins',
      name: 'Plugins',
      description: 'Plugin management and installation',
      icon: '🔌',
      category: 'utility',
      priority: 50,
    },
    routes: [
      {
        path: ROUTES.PLUGINS,
        name: 'Plugin Manager',
        icon: '🔌',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'plugins.open',
        name: 'Open Plugin Manager',
        icon: '🔌',
        shortcut: 'Ctrl+Shift+P',
        execute: () => {
          navigateTo(ROUTES.PLUGINS);
        },
      },
    ],
  });
}

/**
 * App Map Feature
 */
export function registerAppMapFeature() {
  registerCompleteFeature({
    feature: {
      id: 'app-map',
      name: 'App Map',
      description: 'Architecture visualization and dev tools',
      icon: '🗺️',
      category: 'utility',
      priority: 40,
    },
    routes: [
      {
        path: '/app-map',
        name: 'App Map',
        description: 'View app architecture, features, and plugins',
        icon: '🗺️',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'app-map.open',
        name: 'Open App Map',
        description: 'View live app architecture and plugin ecosystem',
        icon: '🗺️',
        shortcut: 'Ctrl+Shift+M',
        execute: () => {
          navigateTo('/app-map');
        },
      },
    ],
  });
}

/**
 * Graph Feature (Arc Graph + Graph Detail views)
 */
export function registerGraphFeature() {
  registerCompleteFeature({
    feature: {
      id: 'graph',
      name: 'Graph',
      description: 'Story arc management and asset graph visualization',
      icon: '📊',
      category: 'creation',
      priority: 80,
    },
    routes: [
      {
        path: ROUTES.ARC_GRAPH,
        name: 'Arc Graph',
        description: 'Manage story arcs, quests, and narrative flow',
        icon: '📝',
        protected: true,
        showInNav: true,
      },
      {
        path: ROUTES.GRAPH_DETAIL,
        name: 'Graph View',
        description: 'Visualize asset dependencies and relationships',
        icon: '📊',
        protected: true,
        showInNav: false,
      },
    ],
    actions: [
      {
        id: 'graph.open-arc-graph',
        name: 'Open Arc Graph',
        description: 'Open the arc graph editor',
        icon: '📝',
        execute: () => {
          navigateTo(ROUTES.ARC_GRAPH);
        },
      },
    ],
  });
}

/**
 * Interactions Feature (Interaction Studio)
 */
export function registerInteractionsFeature() {
  registerCompleteFeature({
    feature: {
      id: 'interactions',
      name: 'Interactions',
      description: 'NPC interaction design and prototyping',
      icon: '💬',
      category: 'game',
      priority: 75,
    },
    routes: [
      {
        path: ROUTES.INTERACTION_STUDIO,
        name: 'Interaction Studio',
        description: 'Design and prototype NPC interactions visually',
        icon: '💬',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'interactions.open-studio',
        name: 'Open Interaction Studio',
        description: 'Open the interaction studio',
        icon: '💬',
        execute: () => {
          navigateTo(ROUTES.INTERACTION_STUDIO);
        },
      },
    ],
  });
}

/**
 * Gizmos Feature (Gizmo Lab)
 */
export function registerGizmosFeature() {
  registerCompleteFeature({
    feature: {
      id: 'gizmos',
      name: 'Gizmos',
      description: 'Interactive tools and gizmo exploration',
      icon: '🔧',
      category: 'utility',
      priority: 55,
    },
    routes: [
      {
        path: ROUTES.GIZMO_LAB,
        name: 'Gizmo Lab',
        description: 'Explore and test gizmos and interactive tools',
        icon: '🔧',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'gizmos.open-lab',
        name: 'Open Gizmo Lab',
        description: 'Open the gizmo lab',
        icon: '🔧',
        execute: () => {
          navigateTo(ROUTES.GIZMO_LAB);
        },
      },
    ],
  });
}
