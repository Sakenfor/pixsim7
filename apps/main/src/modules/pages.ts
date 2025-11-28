/**
 * Additional Page Modules
 *
 * Modules for pages that don't require initialization logic
 * but need to be listed in the navigation/homepage.
 */

import type { Module } from './types';

export const arcGraphModule: Module = {
  id: 'arc-graph',
  name: 'Arc Graph Editor',
  page: {
    route: '/arc-graph',
    icon: 'fileText',
    iconColor: 'text-indigo-500',
    description: 'Manage story arcs, quests, and narrative flow',
    category: 'creation',
    featured: true,
  },
};

export const graphModule: Module = {
  id: 'graph',
  name: 'Graph View',
  page: {
    route: '/graph/1',
    icon: 'graph',
    description: 'Visualize asset dependencies and relationships',
    category: 'development',
  },
};

export const npcPortraitsModule: Module = {
  id: 'npc-portraits',
  name: 'NPC Portraits',
  page: {
    route: '/npc-portraits',
    icon: 'user',
    description: 'Configure NPC expressions mapped to assets',
    category: 'game',
  },
};

export const game2DModule: Module = {
  id: 'game-2d',
  name: '2D Game',
  page: {
    route: '/game-2d',
    icon: 'play',
    description: 'Play the turn-based 2D day cycle game',
    category: 'game',
  },
};

export const gizmoLabModule: Module = {
  id: 'gizmo-lab',
  name: 'Gizmo Lab',
  page: {
    route: '/gizmo-lab',
    icon: 'sparkles',
    iconColor: 'text-purple-500',
    description: 'Explore and test gizmos and interactive tools',
    category: 'development',
  },
};

export const interactionStudioModule: Module = {
  id: 'interaction-studio',
  name: 'Interaction Studio',
  page: {
    route: '/interaction-studio',
    icon: 'sparkles',
    iconColor: 'text-yellow-500',
    description: 'Design and prototype NPC interactions visually',
    category: 'game',
  },
};

export const interactionDemoModule: Module = {
  id: 'interaction-demo',
  name: 'Interaction Demo',
  page: {
    route: '/interaction-demo',
    icon: 'play',
    iconColor: 'text-green-500',
    description: 'See all interaction components in action with live examples',
    category: 'development',
  },
};

export const healthModule: Module = {
  id: 'health',
  name: 'Health Monitor',
  page: {
    route: '/health',
    icon: 'heart',
    iconColor: 'text-red-500',
    description: 'Monitor system health and job status',
    category: 'management',
    featured: true,
  },
};

export const simulationModule: Module = {
  id: 'simulation',
  name: 'Simulation Playground',
  page: {
    route: '/simulation',
    icon: 'play',
    description: 'Test and explore simulation features',
    category: 'development',
    hidden: true, // Dev tool
  },
};

export const npcBrainLabModule: Module = {
  id: 'npc-brain-lab',
  name: 'NPC Brain Lab',
  page: {
    route: '/npc-brain-lab',
    icon: 'bot',
    description: 'Design and test NPC behavior and AI',
    category: 'game',
  },
};

export const appMapModule: Module = {
  id: 'app-map-dev',
  name: 'App Map',
  page: {
    route: '/app-map',
    icon: 'map',
    description: 'Visualize application structure and architecture',
    category: 'development',
    hidden: true, // Dev tool
  },
};

export const pluginWorkspaceModule: Module = {
  id: 'plugin-workspace',
  name: 'Plugin Workspace',
  page: {
    route: '/plugin-workspace',
    icon: 'settings',
    description: 'Manage and develop plugins',
    category: 'development',
    hidden: true, // Dev tool
  },
};

export const modulesDevModule: Module = {
  id: 'modules-dev',
  name: 'Modules Overview',
  page: {
    route: '/dev/modules',
    icon: 'code',
    iconColor: 'text-cyan-500',
    description: 'View all registered modules and their status',
    category: 'development',
    hidden: true, // Dev tool
  },
};

export const overlayConfigModule: Module = {
  id: 'overlay-config',
  name: 'Overlay Configuration',
  page: {
    route: '/settings/overlays',
    icon: 'settings',
    iconColor: 'text-blue-500',
    description: 'Customize overlay positioning and styling for all components',
    category: 'management',
    featured: true,
  },
};
