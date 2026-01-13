/**
 * ID parsing helpers (branded).
 *
 * Runtime helpers that wrap @pixsim7/shared.ref-core and return branded IDs.
 */

import type { ParsedRef, SceneType } from '@pixsim7/shared.types';
import {
  ActionBlockId,
  AssetId,
  CharacterId,
  GenerationId,
  InstanceId,
  LocationId,
  NpcId,
  PromptVersionId,
  SceneId,
  SessionId,
  WorldId,
} from '@pixsim7/shared.types';
import {
  extractActionId as extractActionIdCore,
  extractAssetId as extractAssetIdCore,
  extractCharacterId as extractCharacterIdCore,
  extractGenerationId as extractGenerationIdCore,
  extractInstanceId as extractInstanceIdCore,
  extractLocationId as extractLocationIdCore,
  extractNpcId as extractNpcIdCore,
  extractPromptId as extractPromptIdCore,
  extractRoleInfo as extractRoleInfoCore,
  extractSceneId as extractSceneIdCore,
  extractSceneInfo as extractSceneInfoCore,
  extractSessionId as extractSessionIdCore,
  extractWorldId as extractWorldIdCore,
  parseRef as parseRefCore,
} from '@pixsim7/shared.ref-core';

/**
 * Parse an entity reference string into a typed structure with branded IDs.
 */
export function parseRef(ref: string): ParsedRef | null {
  const result = parseRefCore(ref);
  if (!result) return null;

  // Cast to branded types
  switch (result.type) {
    case 'npc':
      return { type: 'npc', id: NpcId(result.id) };
    case 'character':
      return { type: 'character', id: CharacterId(result.id) };
    case 'instance':
      return { type: 'instance', id: InstanceId(result.id) };
    case 'location':
      return { type: 'location', id: LocationId(result.id) };
    case 'scene':
      return { type: 'scene', id: SceneId(result.id), sceneType: result.sceneType };
    case 'role':
      return { type: 'role', sceneId: SceneId(result.sceneId), roleName: result.roleName };
    case 'asset':
      return { type: 'asset', id: AssetId(result.id) };
    case 'generation':
      return { type: 'generation', id: GenerationId(result.id) };
    case 'prompt':
      return { type: 'prompt', id: PromptVersionId(result.id) };
    case 'action':
      return { type: 'action', id: ActionBlockId(result.id) };
    case 'world':
      return { type: 'world', id: WorldId(result.id) };
    case 'session':
      return { type: 'session', id: SessionId(result.id) };
  }
}

/**
 * Extract NPC ID from a reference string.
 */
export function extractNpcId(ref: string): NpcId | null {
  const id = extractNpcIdCore(ref);
  return id !== null ? NpcId(id) : null;
}

/**
 * Extract character ID from a reference string.
 */
export function extractCharacterId(ref: string): CharacterId | null {
  const id = extractCharacterIdCore(ref);
  return id !== null ? CharacterId(id) : null;
}

/**
 * Extract instance ID from a reference string.
 */
export function extractInstanceId(ref: string): InstanceId | null {
  const id = extractInstanceIdCore(ref);
  return id !== null ? InstanceId(id) : null;
}

/**
 * Extract location ID from a reference string.
 */
export function extractLocationId(ref: string): LocationId | null {
  const id = extractLocationIdCore(ref);
  return id !== null ? LocationId(id) : null;
}

/**
 * Extract scene ID from a reference string.
 */
export function extractSceneId(ref: string): SceneId | null {
  const id = extractSceneIdCore(ref);
  return id !== null ? SceneId(id) : null;
}

/**
 * Extract scene info (branded ID + type) from a reference string.
 */
export function extractSceneInfo(
  ref: string
): { id: SceneId; sceneType: SceneType } | null {
  const info = extractSceneInfoCore(ref);
  return info !== null ? { id: SceneId(info.id), sceneType: info.sceneType } : null;
}

/**
 * Extract asset ID from a reference string.
 */
export function extractAssetId(ref: string): AssetId | null {
  const id = extractAssetIdCore(ref);
  return id !== null ? AssetId(id) : null;
}

/**
 * Extract generation ID from a reference string.
 */
export function extractGenerationId(ref: string): GenerationId | null {
  const id = extractGenerationIdCore(ref);
  return id !== null ? GenerationId(id) : null;
}

/**
 * Extract prompt version ID from a reference string.
 */
export function extractPromptId(ref: string): PromptVersionId | null {
  const id = extractPromptIdCore(ref);
  return id !== null ? PromptVersionId(id) : null;
}

/**
 * Extract action block ID from a reference string.
 */
export function extractActionId(ref: string): ActionBlockId | null {
  const id = extractActionIdCore(ref);
  return id !== null ? ActionBlockId(id) : null;
}

/**
 * Extract role info from a reference string.
 */
export function extractRoleInfo(ref: string): { sceneId: SceneId; roleName: string } | null {
  const info = extractRoleInfoCore(ref);
  return info !== null ? { sceneId: SceneId(info.sceneId), roleName: info.roleName } : null;
}

/**
 * Extract world ID from a reference string.
 */
export function extractWorldId(ref: string): WorldId | null {
  const id = extractWorldIdCore(ref);
  return id !== null ? WorldId(id) : null;
}

/**
 * Extract session ID from a reference string.
 */
export function extractSessionId(ref: string): SessionId | null {
  const id = extractSessionIdCore(ref);
  return id !== null ? SessionId(id) : null;
}
