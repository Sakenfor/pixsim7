/**
 * Shared session state types for @pixsim7/game.engine.
 *
 * These interfaces are used by both the immutable helpers in `session/state.ts`
 * and the mutating helpers in `session/helpers.ts` to avoid type duplication.
 */

/**
 * Arc state structure.
 */
export interface ArcState {
  stage: number;
  seenScenes: number[];
  [key: string]: any;
}

/**
 * Quest state structure.
 */
export interface QuestState {
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  stepsCompleted: number;
  [key: string]: any;
}

/**
 * Inventory item structure.
 */
export interface InventoryItem {
  id: string;
  qty: number;
  [key: string]: any;
}

/**
 * Event state structure.
 */
export interface EventState {
  active: boolean;
  triggeredAt?: number;
  [key: string]: any;
}

