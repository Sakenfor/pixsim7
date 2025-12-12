/**
 * Default Cube Definitions
 *
 * These are the built-in cubes for core functionality.
 * Other modules can register their own cubes by importing cubeRegistry.
 */

import { cubeRegistry } from './cubeRegistry';
import { debugFlags } from '@/lib/utils/debugFlags';

/**
 * Register default cubes
 * Called during plugin initialization
 */
export function registerDefaultCubes() {
  // Creation Cube
  cubeRegistry.register({
    id: 'creation',
    name: 'Creation',
    description: 'Content generation and AI tools',
    color: '#6366f1', // Indigo
    icon: '✨',
    category: 'creation',
    priority: 100,
    workspaces: ['create', 'edit'],
    faces: {
      front: {
        label: 'Generate',
        icon: '✨',
        route: '/workspace',
        action: () => {
          // Open quick generate module
          console.log('Open generation');
        },
      },
      top: {
        label: 'Provider',
        icon: '🎯',
        action: () => console.log('Provider selector'),
      },
      right: {
        label: 'Presets',
        icon: '🎨',
        action: () => console.log('Preset browser'),
      },
      left: {
        label: 'Settings',
        icon: '⚙️',
        action: () => console.log('Generation settings'),
      },
      bottom: {
        label: 'Queue',
        icon: '📊',
        route: '/jobs',
      },
      back: {
        label: 'Advanced',
        icon: '🔬',
        action: () => console.log('Advanced options'),
      },
    },
    getState: () => {
      // TODO: Check if generation is in progress
      return 'idle';
    },
  });

  // Timeline Cube
  cubeRegistry.register({
    id: 'timeline',
    name: 'Timeline',
    description: 'Scene timeline and editing',
    color: '#8b5cf6', // Purple
    icon: '⏱️',
    category: 'editing',
    priority: 90,
    workspaces: ['edit'],
    faces: {
      front: {
        label: 'Timeline',
        icon: '⏱️',
        route: '/workspace',
      },
      top: {
        label: 'Zoom',
        icon: '🔍',
        action: () => console.log('Zoom controls'),
      },
      right: {
        label: 'Grid',
        icon: '📏',
        action: () => console.log('Grid settings'),
      },
      left: {
        label: 'Audio',
        icon: '🎵',
        action: () => console.log('Audio tracks'),
      },
      bottom: {
        label: 'Play',
        icon: '▶️',
        action: () => console.log('Playback controls'),
      },
      back: {
        label: 'Notes',
        icon: '📝',
        action: () => console.log('Timeline notes'),
      },
    },
  });

  // Assets Cube
  cubeRegistry.register({
    id: 'assets',
    name: 'Assets',
    description: 'Asset library and management',
    color: '#8b5cf6', // Purple
    icon: '📦',
    category: 'management',
    priority: 85,
    workspaces: ['create', 'edit', 'review'],
    faces: {
      front: {
        label: 'Recent',
        icon: '📦',
        route: '/assets',
      },
      top: {
        label: 'Favorites',
        icon: '⭐',
        route: '/assets?filter=favorites',
      },
      right: {
        label: 'Uploads',
        icon: '📤',
        action: () => console.log('Upload dialog'),
      },
      left: {
        label: 'Templates',
        icon: '📑',
        route: '/assets?filter=templates',
      },
      bottom: {
        label: 'Trash',
        icon: '🗑️',
        route: '/assets?filter=trash',
      },
      back: {
        label: 'Archive',
        icon: '🗄️',
        route: '/assets?filter=archive',
      },
    },
  });

  // Preview Cube
  cubeRegistry.register({
    id: 'preview',
    name: 'Preview',
    description: 'Real-time preview and playback',
    color: '#ec4899', // Pink
    icon: '👁️',
    category: 'viewing',
    priority: 80,
    workspaces: ['create', 'edit', 'review'],
    faces: {
      front: {
        label: 'Preview',
        icon: '👁️',
        action: () => console.log('Open preview'),
      },
      top: {
        label: 'Controls',
        icon: '🎬',
        action: () => console.log('Playback controls'),
      },
      right: {
        label: 'Settings',
        icon: '📐',
        action: () => console.log('Preview settings'),
      },
      left: {
        label: 'Effects',
        icon: '🎨',
        action: () => console.log('Preview effects'),
      },
      bottom: {
        label: 'Stats',
        icon: '📊',
        action: () => console.log('Preview stats'),
      },
      back: {
        label: 'Export',
        icon: '💾',
        action: () => console.log('Export options'),
      },
    },
  });

  // History Cube
  cubeRegistry.register({
    id: 'history',
    name: 'History',
    description: 'Version history and undo/redo',
    color: '#3b82f6', // Blue
    icon: '📜',
    category: 'management',
    priority: 70,
    workspaces: ['edit', 'review'],
    faces: {
      front: {
        label: 'History',
        icon: '📜',
        action: () => console.log('History panel'),
      },
      top: {
        label: 'Undo',
        icon: '🔄',
        action: () => console.log('Undo/redo'),
      },
      right: {
        label: 'Analytics',
        icon: '📊',
        route: '/analytics',
      },
      left: {
        label: 'Versions',
        icon: '🏷️',
        action: () => console.log('Version list'),
      },
      bottom: {
        label: 'Search',
        icon: '🔍',
        action: () => console.log('History search'),
      },
      back: {
        label: 'Backup',
        icon: '📦',
        action: () => console.log('Backup options'),
      },
    },
  });

  debugFlags.log('registry', '[CubeRegistry] Registered 5 default cubes');
}
