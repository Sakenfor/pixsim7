/**
 * Canonical Entity ID Types
 *
 * This module provides type-safe, branded ID types for all entity references
 * in the system. It ensures compile-time safety when working with different
 * entity types while remaining compatible with plain primitives at runtime.
 *
 * ## Import Patterns
 *
 * ```typescript
 * // Branded ID types and constructors - from @shared/types
 * import { NpcId, LocationId } from '@shared/types';
 * const npcId: NpcId = NpcId(123);
 *
 * // Ref types (NpcRef, SceneIdRef, etc.) - from @shared/types
 * import type { NpcRef, SceneIdRef } from '@shared/types';
 *
 * // Ref runtime functions (Ref builder, parseRef, guards) - from @pixsim7/ref-core
 * import { Ref, parseRef, isNpcRef } from '@pixsim7/ref-core';
 * const ref = Ref.npc(123);  // "npc:123"
 * ```
 *
 * ## Design Principles
 *
 * 1. **Branded types are purely type-level** - No runtime overhead or instanceof checks.
 *    They're structural aliases that provide compile-time safety only.
 *
 * 2. **Use specific types in domain APIs** - Use NpcId/NpcRef explicitly in NPC-specific
 *    code. Reserve EntityRef for truly generic slots (logging, analytics).
 *
 * 3. **Aligned with backend** - String ref formats match backend conventions:
 *    - `character:{uuid}` (character_linkage.py)
 *    - `instance:{uuid}` (character_linkage.py)
 *    - `npc:{number}` (session storage)
 *    - `scene:{type}:{number}` (usage tracking)
 *
 * 4. **Location IDs are numeric** - Always map semantic slugs to numeric IDs in backend.
 *    If semantic slugs are needed, use a separate LocationSlug type.
 *
 * @module ids
 */

// ============================================================================
// REF TYPES FROM REF-CORE
// ============================================================================
// Re-export ref types for convenience. For runtime ref functions (Ref, parseRef,
// isNpcRef, etc.), import directly from @pixsim7/ref-core.

export type {
  NpcRef,
  CharacterRef,
  InstanceRef,
  LocationRef,
  SceneIdRef,
  RoleRef,
  AssetRef,
  GenerationRef,
  PromptRef,
  ActionRef,
  WorldRef,
  SessionRef,
  SceneType,
  EntityRef,
  RefParseErrorReason,
  RefParseResult,
} from '@pixsim7/ref-core';

// Import for internal use (branded wrappers)
import {
  parseRef as parseRefCore,
  extractNpcId as extractNpcIdCore,
  extractCharacterId as extractCharacterIdCore,
  extractInstanceId as extractInstanceIdCore,
  extractLocationId as extractLocationIdCore,
  extractSceneId as extractSceneIdCore,
  extractSceneInfo as extractSceneInfoCore,
  extractAssetId as extractAssetIdCore,
  extractGenerationId as extractGenerationIdCore,
  extractPromptId as extractPromptIdCore,
  extractActionId as extractActionIdCore,
  extractRoleInfo as extractRoleInfoCore,
  extractWorldId as extractWorldIdCore,
  extractSessionId as extractSessionIdCore,
  type SceneType,
} from '@pixsim7/ref-core';

// ============================================================================
// BRANDED BASE TYPES
// ============================================================================

/**
 * Brand symbol for compile-time type safety.
 * This is purely a type-level construct with no runtime representation.
 */
declare const __brand: unique symbol;

/**
 * Creates a branded type from a base type.
 * The brand exists only at compile time for type checking.
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// -----------------------------------------------------------------------------
// Numeric IDs (Database Primary Keys)
// -----------------------------------------------------------------------------

/** NPC entity ID (game_npcs.id) */
export type NpcId = Brand<number, 'NpcId'>;

/** Location entity ID (game_locations.id) */
export type LocationId = Brand<number, 'LocationId'>;

/** World entity ID (game_worlds.id) */
export type WorldId = Brand<number, 'WorldId'>;

/** Session entity ID (game_sessions.id) */
export type SessionId = Brand<number, 'SessionId'>;

/** Scene entity ID (game_scenes.id) */
export type SceneId = Brand<number, 'SceneId'>;

/** Asset entity ID (assets.id) */
export type AssetId = Brand<number, 'AssetId'>;

/** Generation job ID (generations.id) */
export type GenerationId = Brand<number, 'GenerationId'>;

// -----------------------------------------------------------------------------
// UUID-based IDs (Distributed Identity)
// -----------------------------------------------------------------------------

/** Character template ID (characters.id - UUID) */
export type CharacterId = Brand<string, 'CharacterId'>;

/** Character instance ID (character_instances.id - UUID) */
export type InstanceId = Brand<string, 'InstanceId'>;

/** Prompt version ID (prompt_versions.id - UUID) */
export type PromptVersionId = Brand<string, 'PromptVersionId'>;

/** Action block ID (action_blocks.id - UUID) */
export type ActionBlockId = Brand<string, 'ActionBlockId'>;

// ============================================================================
// ID CONSTRUCTORS (Safe Creation)
// ============================================================================

/**
 * ID constructor functions.
 * These cast plain primitives to branded types at the boundary where IDs enter the system.
 *
 * @example
 * ```ts
 * // At API boundary
 * const npcId = NpcId(response.npc_id);
 *
 * // Type-safe usage
 * getNpcRelationship(npcId);  // OK
 * getLocation(npcId);          // Type error!
 * ```
 */

/** Create a branded NpcId from a number */
export const NpcId = (n: number): NpcId => n as NpcId;

/** Create a branded LocationId from a number */
export const LocationId = (n: number): LocationId => n as LocationId;

/** Create a branded WorldId from a number */
export const WorldId = (n: number): WorldId => n as WorldId;

/** Create a branded SessionId from a number */
export const SessionId = (n: number): SessionId => n as SessionId;

/** Create a branded SceneId from a number */
export const SceneId = (n: number): SceneId => n as SceneId;

/** Create a branded AssetId from a number */
export const AssetId = (n: number): AssetId => n as AssetId;

/** Create a branded GenerationId from a number */
export const GenerationId = (n: number): GenerationId => n as GenerationId;

/** Create a branded CharacterId from a UUID string */
export const CharacterId = (uuid: string): CharacterId => uuid as CharacterId;

/** Create a branded InstanceId from a UUID string */
export const InstanceId = (uuid: string): InstanceId => uuid as InstanceId;

/** Create a branded PromptVersionId from a UUID string */
export const PromptVersionId = (uuid: string): PromptVersionId => uuid as PromptVersionId;

/** Create a branded ActionBlockId from a UUID string */
export const ActionBlockId = (uuid: string): ActionBlockId => uuid as ActionBlockId;

// ============================================================================
// PARSED REF (WITH BRANDED IDs)
// ============================================================================

/**
 * Discriminated union of all parsed reference types.
 * Uses branded ID types for type safety.
 */
export type ParsedRef =
  | { type: 'npc'; id: NpcId }
  | { type: 'character'; id: CharacterId }
  | { type: 'instance'; id: InstanceId }
  | { type: 'location'; id: LocationId }
  | { type: 'scene'; id: SceneId; sceneType: SceneType }
  | { type: 'role'; sceneId: SceneId; roleName: string }
  | { type: 'asset'; id: AssetId }
  | { type: 'generation'; id: GenerationId }
  | { type: 'prompt'; id: PromptVersionId }
  | { type: 'action'; id: ActionBlockId }
  | { type: 'world'; id: WorldId }
  | { type: 'session'; id: SessionId };

/**
 * Parse an entity reference string into a typed structure with branded IDs.
 *
 * @param ref - Reference string to parse (e.g., "npc:123", "character:uuid")
 * @returns Parsed reference with branded ID, or null if invalid
 *
 * @example
 * ```ts
 * const parsed = parseRef("npc:123");
 * if (parsed?.type === 'npc') {
 *   getNpcRelationship(parsed.id);  // id is NpcId
 * }
 * ```
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

// ============================================================================
// CONVENIENCE EXTRACTORS (BRANDED)
// ============================================================================

/**
 * Extract NPC ID from a reference string.
 * @returns Branded NpcId if valid, null otherwise
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
export function extractSceneInfo(ref: string): { id: SceneId; sceneType: SceneType } | null {
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
