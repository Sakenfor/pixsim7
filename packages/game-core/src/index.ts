/**
 * @pixsim7/game-core
 *
 * Headless TypeScript game core for PixSim7.
 * Provides pure game logic and derived state for multiple frontends (React/3D/CLI/etc).
 */

// ===== Core =====
export { PixSim7Core, createPixSim7Core } from './core/PixSim7Core';
export type {
  PixSim7CoreConfig,
  CoreEventMap,
  NpcRelationshipState,
  NpcBrainState,
  NpcMemory,
  ApiClient,
  StorageProvider,
  AuthProvider,
  NpcPersonaProvider,
} from './core/types';

// ===== Relationships =====
export {
  compute_relationship_tier,
  compute_intimacy_level,
  extract_relationship_values,
} from './relationships/computation';

export {
  relationshipKeys,
  arcKeys,
  createRelationshipEffect,
  createRelationshipFlagEffect,
  createNpcPairEffect,
  createArcEffect,
  createQuestEffect,
  createInventoryEffect,
  createEventEffect,
  parseNpcKey,
  parseArcKey,
  parseQuestKey,
  formatEffect,
  validateEffect,
} from './relationships/effects';

export type { EdgeEffect } from './relationships/effects';

// ===== Interactions =====
export {
  parseHotspotAction,
  deriveScenePlaybackPhase,
} from './interactions/hotspot';

export type {
  HotspotActionType,
  HotspotAction,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
  ScenePlaybackPhase,
} from './interactions/hotspot';

// ===== World =====
export {
  getNpcRoles,
  assignNpcsToSlots,
  getUnassignedNpcs,
} from './world/slotAssignment';

export type {
  NpcSlotAssignment,
  NpcRoleMap,
} from './world/slotAssignment';

// ===== NPCs =====
export { buildNpcBrainState } from './npcs/brain';
export type { NpcPersona } from './npcs/brain';

// ===== Scene Runtime =====
export {
  evaluateEdgeConditions,
  applyEdgeEffects,
  getPlayableEdges,
  isProgression,
  advanceProgression,
  selectMediaSegment,
  getDefaultNextEdge,
} from './scene/runtime';

// ===== Scene Call Stack =====
export { callStackManager, bindParameters } from './scene/callStack';
export type { CallStackManager } from './scene/callStack';

// ===== Session Helpers =====
export {
  // Generic flags
  getFlag,
  setFlag,
  deleteFlag,
  // Arcs
  getArcState,
  setArcState,
  updateArcStage,
  markSceneSeen,
  hasSeenScene,
  // Quests
  getQuestState,
  setQuestState,
  updateQuestStatus,
  updateQuestSteps,
  incrementQuestSteps,
  // Inventory
  getInventoryItems,
  getInventoryItem,
  addInventoryItem,
  removeInventoryItem,
  hasInventoryItem,
  // Events
  getEventState,
  setEventState,
  triggerEvent,
  endEvent,
  isEventActive,
  // Session kind
  getSessionKind,
  setSessionKind,
  getWorldBlock,
  setWorldBlock,
} from './session/helpers';

export type {
  ArcState,
  QuestState,
  InventoryItem,
  EventState,
} from './session/helpers';
