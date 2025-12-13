/**
 * Core Feature Registration
 *
 * Individual registration functions for core app features.
 * Each function registers a feature's capabilities (routes, actions, states)
 * in the capability registry so plugins can discover and interact with them.
 *
 * These functions are called by their respective modules during initialization.
 */

import { registerCompleteFeature, useCapabilityStore } from './index';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { ROUTES, navigateTo } from './routeConstants';

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

/**
 * Workspace/Scene Builder Feature
 */
export function registerWorkspaceFeature() {
  registerCompleteFeature({
    feature: {
      id: 'workspace',
      name: 'Workspace',
      description: 'Scene building and timeline editing',
      icon: '🎬',
      category: 'editing',
      priority: 95,
    },
    routes: [
      {
        path: ROUTES.WORKSPACE,
        name: 'Workspace',
        description: 'Main editing workspace',
        icon: '🎬',
        protected: true,
        showInNav: true,
      },
    ],
    actions: [
      {
        id: 'workspace.open',
        name: 'Open Workspace',
        icon: '🎬',
        shortcut: 'Ctrl+Shift+W',
        execute: () => {
          navigateTo(ROUTES.WORKSPACE);
        },
      },
      {
        id: 'workspace.save',
        name: 'Save Scene',
        icon: '💾',
        shortcut: 'Ctrl+S',
        execute: async () => {
          // TODO: Save current scene
          console.log('Save scene');
        },
      },
      {
        id: 'workspace.open-panel',
        name: 'Open Panel',
        description: 'Open a floating panel',
        execute: (panelId: string) => {
          useWorkspaceStore.getState().openFloatingPanel(panelId);
        },
      },
    ],
    states: [
      {
        id: 'workspace.panels',
        name: 'Open Panels',
        getValue: () => {
          return useWorkspaceStore.getState().floatingPanels;
        },
        subscribe: (callback) => {
          return useWorkspaceStore.subscribe(
            (state) => state.floatingPanels,
            callback
          );
        },
        readonly: true,
      },
    ],
  });
}

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
