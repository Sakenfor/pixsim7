/**
 * Core Console Module
 *
 * Registers core data stores and console operations.
 * This module should be loaded first as other modules may depend on it.
 */

import type { ConsoleModule } from '../moduleRegistry';
import { dataRegistry } from '../dataRegistry';
import { opsRegistry } from '../opsRegistry';
import { useConsoleStore } from '../consoleStore';

// Import stores
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useGenerationsStore, useGenerationSettingsStore } from '@features/generation';
import { useControlCenterStore } from '@/stores/controlCenterStore';
import { useAssetSelectionStore } from '@/stores/assetSelectionStore';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useGraphStore } from '@/stores/graphStore';

function registerStores(): void {
  dataRegistry.register({
    id: 'workspace',
    name: 'Workspace',
    description: 'Workspace layout, presets, and panel state',
    store: useWorkspaceStore,
    readableKeys: [
      'currentLayout',
      'dockviewLayout',
      'closedPanels',
      'isLocked',
      'presets',
      'fullscreenPanel',
      'floatingPanels',
      'activePresetId',
    ],
  });

  dataRegistry.register({
    id: 'world',
    name: 'World Context',
    description: 'Current world and location context',
    store: useWorldContextStore,
    readableKeys: ['worldId', 'locationId'],
  });

  dataRegistry.register({
    id: 'selection',
    name: 'Selection',
    description: 'Current node/item selection',
    store: useSelectionStore,
    readableKeys: ['selectedNodeIds', 'focusedNodeId'],
  });

  dataRegistry.register({
    id: 'game',
    name: 'Game State',
    description: 'Runtime game state and context',
    store: useGameStateStore,
    readableKeys: ['context', 'isRunning', 'isPaused'],
  });

  dataRegistry.register({
    id: 'generations',
    name: 'Generations',
    description: 'Generation jobs and status',
    store: useGenerationsStore,
    readableKeys: ['generations', 'isLoading', 'error'],
  });

  dataRegistry.register({
    id: 'generationSettings',
    name: 'Generation Settings',
    description: 'Default generation parameters',
    store: useGenerationSettingsStore,
    readableKeys: ['model', 'quality', 'motion', 'duration', 'negativePrompt'],
  });

  dataRegistry.register({
    id: 'controlCenter',
    name: 'Control Center',
    description: 'Control center dock state',
    store: useControlCenterStore,
    readableKeys: ['isExpanded', 'activeTab'],
  });

  dataRegistry.register({
    id: 'assetSelection',
    name: 'Asset Selection',
    description: 'Selected assets for generation',
    store: useAssetSelectionStore,
    readableKeys: ['selectedAssets', 'primaryAssetId'],
  });

  dataRegistry.register({
    id: 'promptSettings',
    name: 'Prompt Settings',
    description: 'Prompt analysis configuration',
    store: usePromptSettingsStore,
    readableKeys: ['autoAnalyze', 'defaultAnalyzer', 'autoExtractBlocks'],
  });

  dataRegistry.register({
    id: 'auth',
    name: 'Auth',
    description: 'Authentication state',
    store: useAuthStore,
    readableKeys: ['user', 'isAuthenticated'],
  });

  dataRegistry.register({
    id: 'graph',
    name: 'Graph Store',
    description: 'Scene editor state - scenes, nodes, edges',
    store: useGraphStore,
    readableKeys: ['scenes', 'currentSceneId', 'sceneMetadata', 'navigationStack'],
  });
}

function registerConsoleOps(): void {
  opsRegistry.registerCategory('console', 'Console', 'Console operations');

  opsRegistry.register('console', {
    id: 'clear',
    name: 'Clear Console',
    description: 'Clear console history',
    execute: () => {
      useConsoleStore.getState().clear();
      return undefined;
    },
  });

  opsRegistry.register('console', {
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
  });
}

export const coreModule: ConsoleModule = {
  id: 'core',
  name: 'Core',
  description: 'Core data stores and console operations',
  register: () => {
    registerStores();
    registerConsoleOps();
  },
};
