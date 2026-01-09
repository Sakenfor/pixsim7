/**
 * Character Graph Helpers
 *
 * Runtime logic for parsing character graph node IDs.
 * Types are imported from @pixsim7/shared.types.
 */
import type { CharacterGraphNodeType, ParsedNodeId } from '@pixsim7/shared.types';
import { parseRef } from '@pixsim7/ref-core';

/**
 * Parse a character graph node ID
 *
 * @deprecated Use canonical `parseRef()` from @pixsim7/shared.types instead.
 * This wrapper maps the canonical parsed result to the legacy ParsedNodeId format.
 *
 * @example
 * ```ts
 * // Old (deprecated):
 * const parsed = parseCharacterGraphNodeId("npc:123")
 *
 * // New (recommended):
 * import { parseRef } from '@pixsim7/shared.types';
 * const parsed = parseRef("npc:123")
 * if (parsed?.type === 'npc') {
 *   console.log(parsed.id) // Typed as NpcId
 * }
 * ```
 */
export function parseCharacterGraphNodeId(nodeId: string): ParsedNodeId | null {
  const parsed = parseRef(nodeId);
  if (!parsed) return null;

  switch (parsed.type) {
    case "character":
      return { type: "character_template", id: parsed.id };
    case "instance":
      return { type: "character_instance", id: parsed.id };
    case "npc":
      return { type: "game_npc", id: parsed.id };
    case "scene":
      return {
        type: "scene",
        subType: parsed.sceneType,
        id: parsed.id,
      };
    case "role":
      return {
        type: "scene_role",
        id: `${parsed.sceneId}:${parsed.roleName}`,
      };
    case "asset":
      return { type: "asset", id: parsed.id };
    case "generation":
      return { type: "generation", id: parsed.id };
    case "prompt":
      return { type: "prompt_version", id: parsed.id };
    case "action":
      return { type: "action_block", id: parsed.id };
    default:
      return null;
  }
}
