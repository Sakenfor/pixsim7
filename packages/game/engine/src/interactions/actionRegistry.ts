/**
 * Game Action Registry
 *
 * Centralized registry for game action types (hotspot/trigger actions).
 * Provides metadata, parsing, and validation for action types.
 *
 * This is a static frontend copy that mirrors the backend GameActionRegistry.
 * Backend source of truth: pixsim7/backend/main/domain/game/core/actions.py
 * Backend API: GET /api/v1/game/actions (returns GameActionTypesResponse)
 *
 * After running `pnpm openapi:gen`, the backend types are available as:
 *   - components["schemas"]["GameActionTypeInfo"]
 *   - components["schemas"]["GameActionTypesResponse"]
 *
 * Usage:
 *   import { gameActionRegistry, parseHotspotAction } from './actionRegistry';
 *
 *   // Get metadata
 *   const meta = gameActionRegistry.get('play_scene');
 *   console.log(meta.label, meta.icon);
 *
 *   // Parse raw action
 *   const action = parseHotspotAction({ type: 'play_scene', scene_id: 123 });
 */

import type {
  HotspotAction,
  HotspotActionType,
  PlaySceneAction,
  ChangeLocationAction,
  NpcTalkAction,
  InteractionSurface,
} from '@pixsim7/shared.types';

/**
 * Metadata for a game action type
 */
export interface GameActionMeta {
  /** Action type identifier */
  type: HotspotActionType;
  /** Human-readable label for UI */
  label: string;
  /** Emoji or icon identifier */
  icon: string;
  /** Interaction surface type */
  surface: InteractionSurface;
  /** Field name that must be present */
  requiredField: string;
  /** Description for documentation */
  description?: string;
  /** Parse raw object into typed action */
  parse: (raw: Record<string, unknown>) => HotspotAction;
}

/**
 * Registry of all game action types
 */
const GAME_ACTION_REGISTRY: Record<HotspotActionType, GameActionMeta> = {
  play_scene: {
    type: 'play_scene',
    label: 'Start Scene',
    icon: '🎬',
    surface: 'scene',
    requiredField: 'scene_id',
    description: 'Play a scene with an NPC',
    parse: (raw): PlaySceneAction => ({
      type: 'play_scene',
      scene_id: raw.scene_id as number | string,
    }),
  },
  change_location: {
    type: 'change_location',
    label: 'Go',
    icon: '🚪',
    surface: 'inline',
    requiredField: 'target_location_id',
    description: 'Navigate to a different location',
    parse: (raw): ChangeLocationAction => ({
      type: 'change_location',
      target_location_id: raw.target_location_id as number | string,
    }),
  },
  npc_talk: {
    type: 'npc_talk',
    label: 'Talk',
    icon: '💬',
    surface: 'dialogue',
    requiredField: 'npc_id',
    description: 'Start a conversation with an NPC',
    parse: (raw): NpcTalkAction => ({
      type: 'npc_talk',
      npc_id: raw.npc_id as number | string,
    }),
  },
};

/**
 * Game action registry with lookup and validation methods
 */
export const gameActionRegistry = {
  /**
   * Get metadata for an action type
   */
  get(type: HotspotActionType): GameActionMeta {
    return GAME_ACTION_REGISTRY[type];
  },

  /**
   * Get metadata for an action type, or undefined if not found
   */
  getOrNull(type: string): GameActionMeta | undefined {
    return GAME_ACTION_REGISTRY[type as HotspotActionType];
  },

  /**
   * Check if an action type is registered
   */
  has(type: string): type is HotspotActionType {
    return type in GAME_ACTION_REGISTRY;
  },

  /**
   * Get all registered action types
   */
  types(): HotspotActionType[] {
    return Object.keys(GAME_ACTION_REGISTRY) as HotspotActionType[];
  },

  /**
   * Get all registered action metadata
   */
  all(): GameActionMeta[] {
    return Object.values(GAME_ACTION_REGISTRY);
  },
} as const;

/**
 * Parse a loose action value into a typed `HotspotAction`.
 * Unknown or malformed actions return `null` so callers can safely ignore them.
 */
export function parseHotspotAction(raw: unknown): HotspotAction | null {
  if (!raw || typeof raw !== 'object') return null;

  const anyRaw = raw as Record<string, unknown>;
  const type = anyRaw.type as string | undefined;

  if (!type || !gameActionRegistry.has(type)) {
    return null;
  }

  const meta = gameActionRegistry.get(type);
  return meta.parse(anyRaw);
}

/**
 * Validate an action has its required field set
 */
export function validateAction(action: HotspotAction): boolean {
  const meta = gameActionRegistry.get(action.type);
  const value = (action as unknown as Record<string, unknown>)[meta.requiredField];
  return value != null;
}
