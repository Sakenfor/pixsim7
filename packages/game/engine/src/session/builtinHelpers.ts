import { sessionHelperRegistry } from './helperRegistry';
import * as helpers from './helpers';

export function registerBuiltinHelpers() {
  // ===== Generic Flag Helpers =====
  sessionHelperRegistry.register({
    name: 'getFlag',
    fn: helpers.getFlag,
    description: 'Get a flag value from session by path',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'path', type: 'string', description: 'Dot-separated path (e.g., "arcs.main.stage")' },
    ],
    returns: 'any',
  });

  sessionHelperRegistry.register({
    name: 'setFlag',
    fn: helpers.setFlag,
    description: 'Set a flag value in session by path (mutates session.flags)',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'path', type: 'string', description: 'Dot-separated path (e.g., "arcs.main.stage")' },
      { name: 'value', type: 'any' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'deleteFlag',
    fn: helpers.deleteFlag,
    description: 'Delete a flag from session',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'path', type: 'string' },
    ],
    returns: 'void',
  });

  // ===== Arc Helpers =====
  sessionHelperRegistry.register({
    name: 'getArcState',
    fn: helpers.getArcState,
    description: 'Get arc state from session',
    category: 'arcs',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arcId', type: 'string' },
    ],
    returns: 'ArcState | null',
  });

  sessionHelperRegistry.register({
    name: 'setArcState',
    fn: helpers.setArcState,
    description: 'Set arc state (mutates session)',
    category: 'arcs',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arcId', type: 'string' },
      { name: 'state', type: 'ArcState' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'updateArcStage',
    fn: helpers.updateArcStage,
    description: 'Update arc stage (mutates session)',
    category: 'arcs',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arcId', type: 'string' },
      { name: 'stage', type: 'number' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'markSceneSeen',
    fn: helpers.markSceneSeen,
    description: 'Mark scene as seen in arc (mutates session)',
    category: 'arcs',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arcId', type: 'string' },
      { name: 'sceneId', type: 'number' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'hasSeenScene',
    fn: helpers.hasSeenScene,
    description: 'Check if a scene has been seen in an arc',
    category: 'arcs',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'arcId', type: 'string' },
      { name: 'sceneId', type: 'number' },
    ],
    returns: 'boolean',
  });

  // ===== Quest Helpers =====
  sessionHelperRegistry.register({
    name: 'getQuestState',
    fn: helpers.getQuestState,
    description: 'Get quest state from session',
    category: 'quests',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'questId', type: 'string' },
    ],
    returns: 'QuestState | null',
  });

  sessionHelperRegistry.register({
    name: 'setQuestState',
    fn: helpers.setQuestState,
    description: 'Set quest state (mutates session)',
    category: 'quests',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'questId', type: 'string' },
      { name: 'state', type: 'QuestState' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'updateQuestStatus',
    fn: helpers.updateQuestStatus,
    description: 'Update quest status (mutates session)',
    category: 'quests',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'questId', type: 'string' },
      { name: 'status', type: "'not_started' | 'in_progress' | 'completed' | 'failed'" },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'updateQuestSteps',
    fn: helpers.updateQuestSteps,
    description: 'Update quest steps completed (mutates session)',
    category: 'quests',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'questId', type: 'string' },
      { name: 'stepsCompleted', type: 'number' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'incrementQuestSteps',
    fn: helpers.incrementQuestSteps,
    description: 'Increment quest step count (mutates session)',
    category: 'quests',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'questId', type: 'string' },
    ],
    returns: 'void',
  });

  // ===== Inventory Helpers =====
  sessionHelperRegistry.register({
    name: 'getInventoryItems',
    fn: helpers.getInventoryItems,
    description: 'Get all inventory items',
    category: 'inventory',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
    ],
    returns: 'InventoryItem[]',
  });

  sessionHelperRegistry.register({
    name: 'getInventoryItem',
    fn: helpers.getInventoryItem,
    description: 'Get a specific inventory item by ID',
    category: 'inventory',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'itemId', type: 'string' },
    ],
    returns: 'InventoryItem | null',
  });

  sessionHelperRegistry.register({
    name: 'addInventoryItem',
    fn: helpers.addInventoryItem,
    description: 'Add item to inventory (mutates session). If item exists, increases quantity',
    category: 'inventory',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'itemId', type: 'string' },
      { name: 'qty', type: 'number', description: 'Defaults to 1' },
      { name: 'metadata', type: 'Record<string, any>', description: 'Optional metadata' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'removeInventoryItem',
    fn: helpers.removeInventoryItem,
    description: 'Remove item from inventory (mutates session). If quantity reaches 0, removes the item entirely',
    category: 'inventory',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'itemId', type: 'string' },
      { name: 'qty', type: 'number', description: 'Defaults to 1' },
    ],
    returns: 'boolean',
  });

  sessionHelperRegistry.register({
    name: 'hasInventoryItem',
    fn: helpers.hasInventoryItem,
    description: 'Check if inventory contains item with minimum quantity',
    category: 'inventory',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'itemId', type: 'string' },
      { name: 'minQty', type: 'number', description: 'Defaults to 1' },
    ],
    returns: 'boolean',
  });

  // ===== Event Helpers =====
  sessionHelperRegistry.register({
    name: 'getEventState',
    fn: helpers.getEventState,
    description: 'Get event state from session',
    category: 'events',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'eventId', type: 'string' },
    ],
    returns: 'EventState | null',
  });

  sessionHelperRegistry.register({
    name: 'setEventState',
    fn: helpers.setEventState,
    description: 'Set event state (mutates session)',
    category: 'events',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'eventId', type: 'string' },
      { name: 'state', type: 'EventState' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'triggerEvent',
    fn: helpers.triggerEvent,
    description: 'Trigger a game event (mutates session)',
    category: 'events',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'eventId', type: 'string' },
      { name: 'worldTime', type: 'number', description: 'Optional world time, defaults to session.world_time' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'endEvent',
    fn: helpers.endEvent,
    description: 'End a game event (mutates session)',
    category: 'events',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'eventId', type: 'string' },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'isEventActive',
    fn: helpers.isEventActive,
    description: 'Check if event is active',
    category: 'events',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'eventId', type: 'string' },
    ],
    returns: 'boolean',
  });

  // ===== Session Kind Helpers =====
  sessionHelperRegistry.register({
    name: 'getSessionKind',
    fn: helpers.getSessionKind,
    description: 'Get session kind (world or scene)',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
    ],
    returns: "'world' | 'scene' | undefined",
  });

  sessionHelperRegistry.register({
    name: 'setSessionKind',
    fn: helpers.setSessionKind,
    description: 'Set session kind (mutates session)',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'kind', type: "'world' | 'scene'" },
    ],
    returns: 'void',
  });

  sessionHelperRegistry.register({
    name: 'getWorldBlock',
    fn: helpers.getWorldBlock,
    description: 'Get world block from session flags',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
    ],
    returns: 'object | null',
  });

  sessionHelperRegistry.register({
    name: 'setWorldBlock',
    fn: helpers.setWorldBlock,
    description: 'Set world block (mutates session)',
    category: 'custom',
    params: [
      { name: 'session', type: 'GameSessionDTO' },
      { name: 'world', type: 'object' },
    ],
    returns: 'void',
  });
}
