/**
 * Core Console Manifest
 *
 * Registers core data stores and console operations.
 */

import { useAssetSelectionStore } from '@features/assets';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useGenerationSettingsStore } from '@features/generation/stores/generationSettingsStore';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';
import { useInteractionStatsStore } from '@features/gizmos/stores/interactionStatsStore';
import { useToolConfigStore } from '@features/gizmos/stores/toolConfigStore';
import { useSelectionStore, useGraphStore } from '@features/graph';
import { usePromptSettingsStore } from '@features/prompts';
import { useWorldContextStore } from '@features/scene';
import { useWorkspaceStore } from '@features/workspace';

import { useAuthStore } from '@/stores/authStore';
import { useGameStateStore } from '@/stores/gameStateStore';


import { useConsoleStore } from '../consoleStore';

import type { ConsoleManifest } from './types';

/**
 * Core console manifest
 *
 * Registers:
 * - All core Zustand stores (workspace, world, selection, game, etc.)
 * - Console operations (console.clear, console.help)
 */
export const coreManifest: ConsoleManifest = {
  id: 'core',
  name: 'Core',
  description: 'Core data stores and console operations',

  data: [
    {
      id: 'workspace',
      name: 'Workspace',
      description: 'Workspace layout, presets, and panel state',
      store: useWorkspaceStore,
      readableKeys: ['layoutByScope', 'closedPanels', 'isLocked', 'presets', 'fullscreenPanel', 'floatingPanels', 'activePresetByScope'],
    },
    {
      id: 'world',
      name: 'World Context',
      description: 'Current world and location context',
      store: useWorldContextStore,
      readableKeys: ['worldId', 'locationId'],
    },
    {
      id: 'selection',
      name: 'Selection',
      description: 'Current node/item selection',
      store: useSelectionStore,
      readableKeys: ['selectedNodeIds', 'focusedNodeId'],
    },
    {
      id: 'game',
      name: 'Game State',
      description: 'Runtime game state and context',
      store: useGameStateStore,
      readableKeys: ['context', 'isRunning', 'isPaused'],
    },
    {
      id: 'generations',
      name: 'Generations',
      description: 'Generation jobs and status',
      store: useGenerationsStore,
      readableKeys: ['generations', 'isLoading', 'error'],
    },
    {
      id: 'generationSettings',
      name: 'Generation Settings',
      description: 'Default generation parameters',
      store: useGenerationSettingsStore,
      readableKeys: ['model', 'quality', 'motion', 'duration', 'negativePrompt'],
    },
    {
      id: 'controlCenter',
      name: 'Control Center',
      description: 'Control center dock state',
      store: useControlCenterStore,
      readableKeys: ['isExpanded', 'activeTab'],
    },
    {
      id: 'assetSelection',
      name: 'Asset Selection',
      description: 'Selected assets for generation',
      store: useAssetSelectionStore,
      readableKeys: ['selectedAssets', 'primaryAssetId'],
    },
    {
      id: 'promptSettings',
      name: 'Prompt Settings',
      description: 'Prompt analysis configuration',
      store: usePromptSettingsStore,
      readableKeys: ['autoAnalyze', 'defaultAnalyzer', 'autoExtractBlocks'],
    },
    {
      id: 'auth',
      name: 'Auth',
      description: 'Authentication state',
      store: useAuthStore,
      readableKeys: ['user', 'isAuthenticated'],
    },
    {
      id: 'graph',
      name: 'Graph Store',
      description: 'Scene editor state - scenes, nodes, edges',
      store: useGraphStore,
      readableKeys: ['scenes', 'currentSceneId', 'sceneMetadata', 'navigationStack'],
    },
    {
      id: 'toolConfig',
      name: 'Tool Configuration',
      description: 'Runtime tool parameter overrides for testing/dev/cheats',
      store: useToolConfigStore,
      readableKeys: ['overrides', 'presets', 'activeToolId', 'history'],
    },
    {
      id: 'interactionStats',
      name: 'Interaction Stats',
      description: 'Dynamic stats for NPC interactions',
      store: useInteractionStatsStore,
      readableKeys: ['stats', 'configs', 'customToolStats', 'isActive', 'history'],
    },
  ],

  ops: {
    categories: [
      { id: 'console', name: 'Console', description: 'Console operations' },
    ],
    operations: [
      {
        categoryId: 'console',
        op: {
          id: 'clear',
          name: 'Clear Console',
          description: 'Clear console history',
          execute: () => {
            useConsoleStore.getState().clear();
            return undefined;
          },
        },
      },
      {
        categoryId: 'console',
        op: {
          id: 'help',
          name: 'Help',
          description: 'Show console help',
          execute: () => {
            return `
Available namespaces:
  pixsim.context  - Current editor state
  pixsim.data     - All data stores
  pixsim.ops      - Operations

Use .__keys__ to list available items
Use .__help__ for detailed info

Examples:
  pixsim.data.__keys__
  pixsim.ops.workspace.listPresets()
  pixsim.context.scene

Tool Commands:
  pixsim.ops.tools.list()           - List all tools
  pixsim.ops.tools.select('feather') - Select a tool
  pixsim.ops.tools.setPressure(0.8) - Override pressure
  pixsim.ops.tools.setSpeed(0.5)    - Override speed
  pixsim.ops.tools.unlockAll()      - [CHEAT] Unlock all
  pixsim.ops.gizmos.list()          - List all gizmos
            `.trim();
          },
        },
      },
    ],
  },
};
