/**
 * Core headless game engine types and interfaces
 * Re-exports core types from @pixsim7/shared.types and local core definitions
 */

// Core types (re-exported from @pixsim7/shared.types via types.ts)
export type {
  CoreEventMap,
  ApiClient,
  StorageProvider,
  AuthProvider,
  GameSession,
  GameNPC,
  NpcRelationshipState,
  RelationshipTier,
  IntimacyLevel,
  PixSim7Core,
  BrainState,
  BrainStatSnapshot,
  BrainMemory,
  DerivedBehaviorUrgency,
  BehaviorUrge,
} from './types';

// BrainState helpers (re-exported from @pixsim7/core.brain)
export {
  hasStat,
  hasDerived,
  getDerived,
  getAxisValue,
  getMood,
  getBehaviorUrgency,
  getTopBehaviorUrges,
  hasBehaviorUrgency,
  getConversationStyle,
  getLogicStrategies,
  getInstincts,
  getMemories,
  getPersonaTags,
  getIntimacyLevel,
  getRelationshipFlags,
} from './types';

export { BaseRegistry } from './BaseRegistry';
