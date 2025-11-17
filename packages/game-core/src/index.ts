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
