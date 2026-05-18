/**
 * GameRuntime and GameController - session orchestration layer
 *
 * Provides a centralized runtime for managing game sessions, applying interactions,
 * and emitting events that UIs can subscribe to.
 */

// Export types
export * from './types';

// Export implementations
export { GameRuntime, createGameRuntime } from './GameRuntime';
export { GameController, createGameController } from './GameController';
export {
  GAME_OBJECT_STORE_SCHEMA_VERSION,
  getSessionGameObjectStore,
  listSessionGameObjects,
  getSessionGameObject,
  upsertSessionGameObjects,
  toGameObjectRef,
  listSessionGameObjectEntities,
  getSessionGameObjectEntity,
} from './gameObjectStore';
export { GameObjectEntity } from './GameObjectEntity';
export {
  GameObjectBehaviorRegistry,
  NOT_HANDLED,
} from './gameObjectBehavior';
export type {
  BehaviorContext,
  BehaviorHandler,
  BehaviorIntent,
  BehaviorOutcome,
} from './gameObjectBehavior';
