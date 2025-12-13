/**
 * Canonical Entity ID Types
 *
 * This module provides type-safe, branded ID types for all entity references
 * in the system. It ensures compile-time safety when working with different
 * entity types while remaining compatible with plain primitives at runtime.
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
// CANONICAL STRING REFS (Serialization Format)
// ============================================================================

/**
 * String reference formats for session storage and inter-system communication.
 * These template literal types ensure consistent formatting across the codebase.
 */

/** NPC reference: `npc:123` */
export type NpcRef = `npc:${number}`;

/** Character template reference: `character:{uuid}` */
export type CharacterRef = `character:${string}`;

/** Character instance reference: `instance:{uuid}` */
export type InstanceRef = `instance:${string}`;

/** Location reference: `location:123` */
export type LocationRef = `location:${number}`;

/** Scene ID reference: `scene:game:123` or `scene:content:123` */
export type SceneIdRef = `scene:${'game' | 'content'}:${number}`;

/** Scene role reference: `role:123:protagonist` */
export type RoleRef = `role:${number}:${string}`;

/** Asset reference: `asset:123` */
export type AssetRef = `asset:${number}`;

/** Generation reference: `generation:123` */
export type GenerationRef = `generation:${number}`;

/** Prompt version reference: `prompt:{uuid}` */
export type PromptRef = `prompt:${string}`;

/** Action block reference: `action:{uuid}` */
export type ActionRef = `action:${string}`;

/**
 * Union of all entity reference types.
 *
 * **Use sparingly** - Prefer specific ref types (NpcRef, CharacterRef) in domain APIs.
 * Reserve EntityRef for truly generic contexts like logging, analytics, or graph traversal.
 */
export type EntityRef =
  | NpcRef
  | CharacterRef
  | InstanceRef
  | LocationRef
  | SceneIdRef
  | RoleRef
  | AssetRef
  | GenerationRef
  | PromptRef
  | ActionRef;

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
// REF BUILDERS (Canonical String Format)
// ============================================================================

/**
 * Reference builders for creating canonical string references.
 *
 * These ensure consistent formatting when storing entity references in:
 * - Session flags/stats (e.g., `session.stats.relationships["npc:123"]`)
 * - Graph node IDs
 * - Metadata fields
 * - Inter-system communication
 *
 * @example
 * ```ts
 * // Build refs for session storage
 * const key = Ref.npc(npcId);  // "npc:123"
 *
 * // Store in session
 * session.stats.relationships[key] = { affinity: 50 };
 * ```
 */
export const Ref = {
  /** Build NPC reference: `npc:123` */
  npc: (id: NpcId | number): NpcRef => `npc:${id}` as NpcRef,

  /** Build character template reference: `character:{uuid}` */
  character: (id: CharacterId | string): CharacterRef => `character:${id}` as CharacterRef,

  /** Build character instance reference: `instance:{uuid}` */
  instance: (id: InstanceId | string): InstanceRef => `instance:${id}` as InstanceRef,

  /** Build location reference: `location:123` */
  location: (id: LocationId | number): LocationRef => `location:${id}` as LocationRef,

  /** Build scene ID reference: `scene:game:123` or `scene:content:123` */
  scene: (id: SceneId | number, type: 'game' | 'content' = 'game'): SceneIdRef =>
    `scene:${type}:${id}` as SceneIdRef,

  /** Build scene role reference: `role:123:protagonist` */
  role: (sceneId: SceneId | number, roleName: string): RoleRef =>
    `role:${sceneId}:${roleName}` as RoleRef,

  /** Build asset reference: `asset:123` */
  asset: (id: AssetId | number): AssetRef => `asset:${id}` as AssetRef,

  /** Build generation reference: `generation:123` */
  generation: (id: GenerationId | number): GenerationRef => `generation:${id}` as GenerationRef,

  /** Build prompt version reference: `prompt:{uuid}` */
  prompt: (id: PromptVersionId | string): PromptRef => `prompt:${id}` as PromptRef,

  /** Build action block reference: `action:{uuid}` */
  action: (id: ActionBlockId | string): ActionRef => `action:${id}` as ActionRef,
} as const;

// ============================================================================
// UUID VALIDATION
// ============================================================================

/**
 * UUID v4 regex pattern.
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4 format.
 *
 * @param value - String to validate
 * @returns true if valid UUID format
 *
 * @example
 * ```ts
 * isUUID('550e8400-e29b-41d4-a716-446655440000')  // true
 * isUUID('not-a-uuid')                            // false
 * isUUID('')                                      // false
 * ```
 */
export function isUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// ============================================================================
// REF PARSERS
// ============================================================================

/**
 * Discriminated union of all parsed reference types.
 * Used as the return type of parseRef() for type-safe handling.
 */
export type ParsedRef =
  | { type: 'npc'; id: NpcId }
  | { type: 'character'; id: CharacterId }
  | { type: 'instance'; id: InstanceId }
  | { type: 'location'; id: LocationId }
  | { type: 'scene'; id: SceneId; sceneType: 'game' | 'content' }
  | { type: 'role'; sceneId: SceneId; roleName: string }
  | { type: 'asset'; id: AssetId }
  | { type: 'generation'; id: GenerationId }
  | { type: 'prompt'; id: PromptVersionId }
  | { type: 'action'; id: ActionBlockId };

/**
 * Parse an entity reference string into a typed structure.
 *
 * @param ref - Reference string to parse (e.g., "npc:123", "character:uuid")
 * @returns Parsed reference with typed ID, or null if invalid
 *
 * @example
 * ```ts
 * const parsed = parseRef("npc:123");
 * if (parsed?.type === 'npc') {
 *   getNpcRelationship(parsed.id);  // id is NpcId
 * }
 *
 * const invalid = parseRef("invalid");  // null
 * ```
 */
export function parseRef(ref: string): ParsedRef | null {
  if (!ref || !ref.includes(':')) return null;

  const colonIndex = ref.indexOf(':');
  const prefix = ref.slice(0, colonIndex);
  const value = ref.slice(colonIndex + 1);

  switch (prefix) {
    case 'npc': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return null;
      return { type: 'npc', id: NpcId(n) };
    }

    case 'character': {
      if (!isUUID(value)) return null;
      return { type: 'character', id: CharacterId(value) };
    }

    case 'instance': {
      if (!isUUID(value)) return null;
      return { type: 'instance', id: InstanceId(value) };
    }

    case 'location': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return null;
      return { type: 'location', id: LocationId(n) };
    }

    case 'scene': {
      // Format: scene:game:123 or scene:content:123
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) return null;

      const sceneType = value.slice(0, secondColonIndex);
      if (sceneType !== 'game' && sceneType !== 'content') return null;

      const idStr = value.slice(secondColonIndex + 1);
      const n = Number(idStr);
      if (!Number.isInteger(n) || n < 0) return null;

      return { type: 'scene', id: SceneId(n), sceneType };
    }

    case 'role': {
      // Format: role:123:protagonist
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) return null;

      const sceneIdStr = value.slice(0, secondColonIndex);
      const roleName = value.slice(secondColonIndex + 1);

      const sceneId = Number(sceneIdStr);
      if (!Number.isInteger(sceneId) || sceneId < 0 || !roleName) return null;

      return { type: 'role', sceneId: SceneId(sceneId), roleName };
    }

    case 'asset': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return null;
      return { type: 'asset', id: AssetId(n) };
    }

    case 'generation': {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) return null;
      return { type: 'generation', id: GenerationId(n) };
    }

    case 'prompt': {
      if (!isUUID(value)) return null;
      return { type: 'prompt', id: PromptVersionId(value) };
    }

    case 'action': {
      if (!isUUID(value)) return null;
      return { type: 'action', id: ActionBlockId(value) };
    }

    default:
      return null;
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard functions for checking reference string formats.
 * Useful for runtime validation at system boundaries.
 */

/** Check if string is a valid NPC reference */
export const isNpcRef = (ref: string): ref is NpcRef =>
  /^npc:\d+$/.test(ref);

/** Check if string is a valid character reference */
export const isCharacterRef = (ref: string): ref is CharacterRef =>
  /^character:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

/** Check if string is a valid instance reference */
export const isInstanceRef = (ref: string): ref is InstanceRef =>
  /^instance:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

/** Check if string is a valid location reference */
export const isLocationRef = (ref: string): ref is LocationRef =>
  /^location:\d+$/.test(ref);

/** Check if string is a valid scene ID reference */
export const isSceneIdRef = (ref: string): ref is SceneIdRef =>
  /^scene:(game|content):\d+$/.test(ref);

/** Check if string is a valid role reference */
export const isRoleRef = (ref: string): ref is RoleRef =>
  /^role:\d+:.+$/.test(ref);

/** Check if string is a valid asset reference */
export const isAssetRef = (ref: string): ref is AssetRef =>
  /^asset:\d+$/.test(ref);

/** Check if string is a valid generation reference */
export const isGenerationRef = (ref: string): ref is GenerationRef =>
  /^generation:\d+$/.test(ref);

/** Check if string is a valid prompt reference */
export const isPromptRef = (ref: string): ref is PromptRef =>
  /^prompt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

/** Check if string is a valid action reference */
export const isActionRef = (ref: string): ref is ActionRef =>
  /^action:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

/** Check if string is any valid entity reference */
export const isEntityRef = (ref: string): ref is EntityRef =>
  isNpcRef(ref) ||
  isCharacterRef(ref) ||
  isInstanceRef(ref) ||
  isLocationRef(ref) ||
  isSceneIdRef(ref) ||
  isRoleRef(ref) ||
  isAssetRef(ref) ||
  isGenerationRef(ref) ||
  isPromptRef(ref) ||
  isActionRef(ref);

// ============================================================================
// CONVENIENCE EXTRACTORS
// ============================================================================

/**
 * Extract NPC ID from a reference string.
 * Convenience wrapper around parseRef for the common case.
 *
 * @param ref - Reference string (e.g., "npc:123")
 * @returns NpcId if valid, null otherwise
 *
 * @example
 * ```ts
 * const npcId = extractNpcId("npc:123");  // NpcId(123)
 * const invalid = extractNpcId("character:uuid");  // null
 * ```
 */
export function extractNpcId(ref: string): NpcId | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'npc' ? parsed.id : null;
}

/**
 * Extract character ID from a reference string.
 */
export function extractCharacterId(ref: string): CharacterId | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'character' ? parsed.id : null;
}

/**
 * Extract instance ID from a reference string.
 */
export function extractInstanceId(ref: string): InstanceId | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'instance' ? parsed.id : null;
}

/**
 * Extract location ID from a reference string.
 */
export function extractLocationId(ref: string): LocationId | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'location' ? parsed.id : null;
}

/**
 * Extract scene ID from a reference string.
 */
export function extractSceneId(ref: string): SceneId | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'scene' ? parsed.id : null;
}
