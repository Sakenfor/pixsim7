/**
 * Register Core Stores
 *
 * Registers all core Zustand stores with the data registry
 * so they're accessible via pixsim.data.*
 */

import { dataRegistry } from './dataRegistry';

// Import stores
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWorldContextStore } from '@/stores/worldContextStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useGameStateStore } from '@/stores/gameStateStore';
import { useGenerationsStore } from '@/stores/generationsStore';
import { useGenerationSettingsStore } from '@/stores/generationSettingsStore';
import { useControlCenterStore } from '@/stores/controlCenterStore';
import { useAssetSelectionStore } from '@/stores/assetSelectionStore';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useGraphStore } from '@/stores/graphStore';
import { useToolConfigStore } from '@/stores/toolConfigStore';
import { useInteractionStatsStore } from '@/stores/interactionStatsStore';

/**
 * Register all core stores
 */
export function registerCoreStores(): void {
  // Workspace
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

  // World Context
  dataRegistry.register({
    id: 'world',
    name: 'World Context',
    description: 'Current world and location context',
    store: useWorldContextStore,
    readableKeys: ['worldId', 'locationId'],
  });

  // Selection
  dataRegistry.register({
    id: 'selection',
    name: 'Selection',
    description: 'Current node/item selection',
    store: useSelectionStore,
    readableKeys: ['selectedNodeIds', 'focusedNodeId'],
  });

  // Game State
  dataRegistry.register({
    id: 'game',
    name: 'Game State',
    description: 'Runtime game state and context',
    store: useGameStateStore,
    readableKeys: ['context', 'isRunning', 'isPaused'],
  });

  // Generations
  dataRegistry.register({
    id: 'generations',
    name: 'Generations',
    description: 'Generation jobs and status',
    store: useGenerationsStore,
    readableKeys: ['generations', 'isLoading', 'error'],
  });

  // Generation Settings
  dataRegistry.register({
    id: 'generationSettings',
    name: 'Generation Settings',
    description: 'Default generation parameters',
    store: useGenerationSettingsStore,
    readableKeys: ['model', 'quality', 'motion', 'duration', 'negativePrompt'],
  });

  // Control Center
  dataRegistry.register({
    id: 'controlCenter',
    name: 'Control Center',
    description: 'Control center dock state',
    store: useControlCenterStore,
    readableKeys: ['isExpanded', 'activeTab'],
  });

  // Asset Selection
  dataRegistry.register({
    id: 'assetSelection',
    name: 'Asset Selection',
    description: 'Selected assets for generation',
    store: useAssetSelectionStore,
    readableKeys: ['selectedAssets', 'primaryAssetId'],
  });

  // Prompt Settings
  dataRegistry.register({
    id: 'promptSettings',
    name: 'Prompt Settings',
    description: 'Prompt analysis configuration',
    store: usePromptSettingsStore,
    readableKeys: ['autoAnalyze', 'defaultAnalyzer', 'autoExtractBlocks'],
  });

  // Auth
  dataRegistry.register({
    id: 'auth',
    name: 'Auth',
    description: 'Authentication state',
    store: useAuthStore,
    readableKeys: ['user', 'isAuthenticated'],
  });

  // Graph (Scene Editor)
  dataRegistry.register({
    id: 'graph',
    name: 'Graph Store',
    description: 'Scene editor state - scenes, nodes, edges',
    store: useGraphStore,
    readableKeys: [
      'scenes',
      'currentSceneId',
      'sceneMetadata',
      'navigationStack',
    ],
  });

  // Tool Configuration
  dataRegistry.register({
    id: 'toolConfig',
    name: 'Tool Configuration',
    description: 'Runtime tool parameter overrides for testing/dev/cheats',
    store: useToolConfigStore,
    readableKeys: [
      'overrides',
      'presets',
      'activeToolId',
      'history',
    ],
  });

  // Interaction Stats
  dataRegistry.register({
    id: 'interactionStats',
    name: 'Interaction Stats',
    description: 'Dynamic stats for NPC interactions (pleasure, tickle, arousal, etc.)',
    store: useInteractionStatsStore,
    readableKeys: [
      'stats',
      'configs',
      'customToolStats',
      'isActive',
      'history',
    ],
  });
}
