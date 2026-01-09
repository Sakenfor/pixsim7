/**
 * Game Object Type Guards
 *
 * Runtime logic for type narrowing on GameObject discriminated unions.
 * Types are imported from @pixsim7/shared.types.
 */
import type {
  GameObject,
  NpcObject,
  ItemObject,
  PropObject,
  PlayerObject,
  TriggerObject,
} from '@pixsim7/shared.types';

/**
 * Type guard to check if a GameObject is an NpcObject
 */
export function isNpcObject(obj: GameObject): obj is NpcObject {
  return obj.kind === 'npc';
}

/**
 * Type guard to check if a GameObject is an ItemObject
 */
export function isItemObject(obj: GameObject): obj is ItemObject {
  return obj.kind === 'item';
}

/**
 * Type guard to check if a GameObject is a PropObject
 */
export function isPropObject(obj: GameObject): obj is PropObject {
  return obj.kind === 'prop';
}

/**
 * Type guard to check if a GameObject is a PlayerObject
 */
export function isPlayerObject(obj: GameObject): obj is PlayerObject {
  return obj.kind === 'player';
}

/**
 * Type guard to check if a GameObject is a TriggerObject
 */
export function isTriggerObject(obj: GameObject): obj is TriggerObject {
  return obj.kind === 'trigger';
}
