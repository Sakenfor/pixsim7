/**
 * Ref Core - Canonical Entity Reference Types and Utilities
 *
 * This module provides pure TypeScript ref types, builders, parsers, and guards.
 * It is environment-agnostic (no DOM/React dependencies).
 *
 * ## Ref String Formats
 *
 * Refs use colon-separated string formats for serialization:
 * - `npc:123` - NPC reference
 * - `character:{uuid}` - Character template reference
 * - `scene:game:123` / `scene:content:123` - Scene reference with type qualifier
 * - `location:123` - Location reference
 *
 * ## Design Principles
 *
 * 1. **Pure string types** - Ref types are template literal strings for compile-time safety
 * 2. **No runtime overhead** - Type guards use regex for validation
 * 3. **Backend alignment** - Formats match backend conventions
 *
 * @module ref-core
 */

// ============================================================================
// REF STRING TYPES
// ============================================================================

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

/** World reference: `world:123` */
export type WorldRef = `world:${number}`;

/** Session reference: `session:123` */
export type SessionRef = `session:${number}`;

/**
 * Scene type qualifier for scene refs.
 * - `game`: Runtime game scene
 * - `content`: Content/template scene
 */
export type SceneType = 'game' | 'content';

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
  | ActionRef
  | WorldRef
  | SessionRef;

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
 */
export function isUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// ============================================================================
// REF BUILDERS
// ============================================================================

/**
 * Reference builders for creating canonical string references.
 *
 * These ensure consistent formatting when storing entity references in:
 * - Session flags/stats (e.g., `session.stats.relationships["npc:123"]`)
 * - Graph node IDs
 * - Metadata fields
 * - Inter-system communication
 */
export const Ref = {
  /** Build NPC reference: `npc:123` */
  npc: (id: number): NpcRef => `npc:${id}` as NpcRef,

  /** Build character template reference: `character:{uuid}` */
  character: (id: string): CharacterRef => `character:${id}` as CharacterRef,

  /** Build character instance reference: `instance:{uuid}` */
  instance: (id: string): InstanceRef => `instance:${id}` as InstanceRef,

  /** Build location reference: `location:123` */
  location: (id: number): LocationRef => `location:${id}` as LocationRef,

  /** Build scene ID reference: `scene:game:123` or `scene:content:123` */
  scene: (id: number, type: SceneType = 'game'): SceneIdRef =>
    `scene:${type}:${id}` as SceneIdRef,

  /** Build scene role reference: `role:123:protagonist` */
  role: (sceneId: number, roleName: string): RoleRef =>
    `role:${sceneId}:${roleName}` as RoleRef,

  /** Build asset reference: `asset:123` */
  asset: (id: number): AssetRef => `asset:${id}` as AssetRef,

  /** Build generation reference: `generation:123` */
  generation: (id: number): GenerationRef => `generation:${id}` as GenerationRef,

  /** Build prompt version reference: `prompt:{uuid}` */
  prompt: (id: string): PromptRef => `prompt:${id}` as PromptRef,

  /** Build action block reference: `action:{uuid}` */
  action: (id: string): ActionRef => `action:${id}` as ActionRef,

  /** Build world reference: `world:123` */
  world: (id: number): WorldRef => `world:${id}` as WorldRef,

  /** Build session reference: `session:123` */
  session: (id: number): SessionRef => `session:${id}` as SessionRef,
} as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

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

/** Check if string is a valid world reference */
export const isWorldRef = (ref: string): ref is WorldRef =>
  /^world:\d+$/.test(ref);

/** Check if string is a valid session reference */
export const isSessionRef = (ref: string): ref is SessionRef =>
  /^session:\d+$/.test(ref);

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
  isActionRef(ref) ||
  isWorldRef(ref) ||
  isSessionRef(ref);

// ============================================================================
// REF PARSERS
// ============================================================================

/**
 * Discriminated union of all parsed reference types.
 * Returns raw number/string IDs (not branded).
 */
export type ParsedRef =
  | { type: 'npc'; id: number }
  | { type: 'character'; id: string }
  | { type: 'instance'; id: string }
  | { type: 'location'; id: number }
  | { type: 'scene'; id: number; sceneType: SceneType }
  | { type: 'role'; sceneId: number; roleName: string }
  | { type: 'asset'; id: number }
  | { type: 'generation'; id: number }
  | { type: 'prompt'; id: string }
  | { type: 'action'; id: string }
  | { type: 'world'; id: number }
  | { type: 'session'; id: number };

/**
 * Parse an entity reference string into a typed structure.
 *
 * @param ref - Reference string to parse (e.g., "npc:123", "character:uuid")
 * @returns Parsed reference with typed ID, or null if invalid
 */
export function parseRef(ref: string): ParsedRef | null {
  if (!ref || !ref.includes(':')) return null;

  const colonIndex = ref.indexOf(':');
  const prefix = ref.slice(0, colonIndex);
  const value = ref.slice(colonIndex + 1);

  const parseNonNegativeInt = (val: string): number | null => {
    const normalized = val.trim();
    if (normalized === '') return null;
    const n = Number(normalized);
    if (!Number.isInteger(n) || n < 0) return null;
    return n;
  };

  switch (prefix) {
    case 'npc': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'npc', id: n };
    }

    case 'character': {
      if (!isUUID(value)) return null;
      return { type: 'character', id: value };
    }

    case 'instance': {
      if (!isUUID(value)) return null;
      return { type: 'instance', id: value };
    }

    case 'location': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'location', id: n };
    }

    case 'scene': {
      // Format: scene:game:123 or scene:content:123
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) return null;

      const sceneType = value.slice(0, secondColonIndex);
      if (sceneType !== 'game' && sceneType !== 'content') return null;

      const idStr = value.slice(secondColonIndex + 1);
      const n = parseNonNegativeInt(idStr);
      if (n === null) return null;

      return { type: 'scene', id: n, sceneType };
    }

    case 'role': {
      // Format: role:123:protagonist
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) return null;

      const sceneIdStr = value.slice(0, secondColonIndex);
      const roleName = value.slice(secondColonIndex + 1);

      const sceneId = parseNonNegativeInt(sceneIdStr);
      if (sceneId === null || !roleName) return null;

      return { type: 'role', sceneId, roleName };
    }

    case 'asset': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'asset', id: n };
    }

    case 'generation': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'generation', id: n };
    }

    case 'prompt': {
      if (!isUUID(value)) return null;
      return { type: 'prompt', id: value };
    }

    case 'action': {
      if (!isUUID(value)) return null;
      return { type: 'action', id: value };
    }

    case 'world': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'world', id: n };
    }

    case 'session': {
      const n = parseNonNegativeInt(value);
      if (n === null) return null;
      return { type: 'session', id: n };
    }

    default:
      return null;
  }
}

// ============================================================================
// PARSE REF WITH ERROR CONTEXT
// ============================================================================

/**
 * Error reasons for ref parsing failures.
 */
export type RefParseErrorReason =
  | 'empty_string'
  | 'missing_colon'
  | 'unknown_type'
  | 'invalid_number'
  | 'negative_number'
  | 'invalid_uuid'
  | 'missing_scene_type'
  | 'invalid_scene_type'
  | 'missing_role_name';

/**
 * Result of parsing a ref with error context.
 */
export type RefParseResult =
  | { success: true; parsed: ParsedRef }
  | { success: false; reason: RefParseErrorReason; message: string };

/**
 * Parse an entity reference string with detailed error context.
 *
 * Use this when you need to provide user feedback about why a ref is invalid.
 */
export function tryParseRef(ref: string): RefParseResult {
  if (!ref) {
    return { success: false, reason: 'empty_string', message: 'Reference string is empty' };
  }

  if (!ref.includes(':')) {
    return { success: false, reason: 'missing_colon', message: 'Reference must contain a colon separator' };
  }

  const colonIndex = ref.indexOf(':');
  const prefix = ref.slice(0, colonIndex);
  const value = ref.slice(colonIndex + 1);

  type ValidationSuccess = { valid: true; n: number };
  type ValidationError = { valid: false; reason: RefParseErrorReason; message: string };
  type ValidationResult = ValidationSuccess | ValidationError;

  const validateNumericId = (val: string): ValidationResult => {
    const normalized = val.trim();
    if (normalized === '') {
      return { valid: false, reason: 'invalid_number', message: 'ID is required' };
    }
    const n = Number(normalized);
    if (!Number.isFinite(n)) {
      return { valid: false, reason: 'invalid_number', message: `Invalid number: "${val}"` };
    }
    if (!Number.isInteger(n)) {
      return { valid: false, reason: 'invalid_number', message: `ID must be an integer, got: ${val}` };
    }
    if (n < 0) {
      return { valid: false, reason: 'negative_number', message: `ID cannot be negative: ${n}` };
    }
    return { valid: true, n };
  };

  // Parse a numeric ID and return error result if invalid
  const parseNumericId = (
    val: string
  ): { success: true; n: number } | { success: false; reason: RefParseErrorReason; message: string } => {
    const result = validateNumericId(val);
    if (result.valid === false) {
      return { success: false, reason: result.reason, message: result.message };
    }
    return { success: true, n: result.n };
  };

  switch (prefix) {
    case 'npc': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'npc', id: result.n } };
    }

    case 'character': {
      if (!isUUID(value)) {
        return { success: false, reason: 'invalid_uuid', message: `Invalid UUID format for character: "${value}"` };
      }
      return { success: true, parsed: { type: 'character', id: value } };
    }

    case 'instance': {
      if (!isUUID(value)) {
        return { success: false, reason: 'invalid_uuid', message: `Invalid UUID format for instance: "${value}"` };
      }
      return { success: true, parsed: { type: 'instance', id: value } };
    }

    case 'location': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'location', id: result.n } };
    }

    case 'scene': {
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) {
        return { success: false, reason: 'missing_scene_type', message: 'Scene ref must have format scene:type:id (e.g., scene:game:123)' };
      }

      const sceneType = value.slice(0, secondColonIndex);
      if (sceneType !== 'game' && sceneType !== 'content') {
        return { success: false, reason: 'invalid_scene_type', message: `Scene type must be "game" or "content", got: "${sceneType}"` };
      }

      const idStr = value.slice(secondColonIndex + 1);
      const result = parseNumericId(idStr);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }

      return { success: true, parsed: { type: 'scene', id: result.n, sceneType } };
    }

    case 'role': {
      const secondColonIndex = value.indexOf(':');
      if (secondColonIndex === -1) {
        return { success: false, reason: 'missing_role_name', message: 'Role ref must have format role:sceneId:roleName (e.g., role:123:protagonist)' };
      }

      const sceneIdStr = value.slice(0, secondColonIndex);
      const roleName = value.slice(secondColonIndex + 1);

      const result = parseNumericId(sceneIdStr);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }

      if (!roleName) {
        return { success: false, reason: 'missing_role_name', message: 'Role name cannot be empty' };
      }

      return { success: true, parsed: { type: 'role', sceneId: result.n, roleName } };
    }

    case 'asset': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'asset', id: result.n } };
    }

    case 'generation': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'generation', id: result.n } };
    }

    case 'prompt': {
      if (!isUUID(value)) {
        return { success: false, reason: 'invalid_uuid', message: `Invalid UUID format for prompt: "${value}"` };
      }
      return { success: true, parsed: { type: 'prompt', id: value } };
    }

    case 'action': {
      if (!isUUID(value)) {
        return { success: false, reason: 'invalid_uuid', message: `Invalid UUID format for action: "${value}"` };
      }
      return { success: true, parsed: { type: 'action', id: value } };
    }

    case 'world': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'world', id: result.n } };
    }

    case 'session': {
      const result = parseNumericId(value);
      if (result.success === false) {
        return { success: false, reason: result.reason, message: result.message };
      }
      return { success: true, parsed: { type: 'session', id: result.n } };
    }

    default:
      return { success: false, reason: 'unknown_type', message: `Unknown ref type: "${prefix}"` };
  }
}

// ============================================================================
// CONVENIENCE EXTRACTORS
// ============================================================================

/**
 * Extract NPC ID from a reference string.
 * @returns numeric ID if valid, null otherwise
 */
export function extractNpcId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'npc' ? parsed.id : null;
}

/**
 * Extract character ID from a reference string.
 */
export function extractCharacterId(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'character' ? parsed.id : null;
}

/**
 * Extract instance ID from a reference string.
 */
export function extractInstanceId(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'instance' ? parsed.id : null;
}

/**
 * Extract location ID from a reference string.
 */
export function extractLocationId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'location' ? parsed.id : null;
}

/**
 * Extract scene ID from a reference string.
 */
export function extractSceneId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'scene' ? parsed.id : null;
}

/**
 * Extract scene info (ID + type) from a reference string.
 */
export function extractSceneInfo(ref: string): { id: number; sceneType: SceneType } | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'scene' ? { id: parsed.id, sceneType: parsed.sceneType } : null;
}

/**
 * Extract asset ID from a reference string.
 */
export function extractAssetId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'asset' ? parsed.id : null;
}

/**
 * Extract generation ID from a reference string.
 */
export function extractGenerationId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'generation' ? parsed.id : null;
}

/**
 * Extract prompt version ID from a reference string.
 */
export function extractPromptId(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'prompt' ? parsed.id : null;
}

/**
 * Extract action block ID from a reference string.
 */
export function extractActionId(ref: string): string | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'action' ? parsed.id : null;
}

/**
 * Extract role info from a reference string.
 */
export function extractRoleInfo(ref: string): { sceneId: number; roleName: string } | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'role' ? { sceneId: parsed.sceneId, roleName: parsed.roleName } : null;
}

/**
 * Extract world ID from a reference string.
 */
export function extractWorldId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'world' ? parsed.id : null;
}

/**
 * Extract session ID from a reference string.
 */
export function extractSessionId(ref: string): number | null {
  const parsed = parseRef(ref);
  return parsed?.type === 'session' ? parsed.id : null;
}

// ============================================================================
// REF TYPE EXTRACTION
// ============================================================================

/**
 * Get the type prefix from a ref string without full parsing.
 * Faster than parseRef when you only need the type.
 */
export function getRefType(ref: string): string | null {
  if (!ref || !ref.includes(':')) return null;
  return ref.slice(0, ref.indexOf(':'));
}
