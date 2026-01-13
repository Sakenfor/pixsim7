/**
 * Graph Reference Helpers
 *
 * Centralized utilities for working with canonical IDs and refs in graph nodes.
 * Provides type-safe conversion between raw IDs and canonical ref formats.
 *
 * @module graph/refs
 */

 

// Ref logic from ref-core (pure TS, no DOM)
import {
  type NpcRef,
  type CharacterRef,
  type InstanceRef,
  type SceneIdRef,
  type LocationRef,
  type AssetRef,
  type EntityRef,
  type ParsedRef,
  Ref,
  parseRef,
  isUUID,
  isNpcRef,
  isCharacterRef,
  isInstanceRef,
  isSceneIdRef,
  isLocationRef,
  isAssetRef,
} from '@pixsim7/shared.ref-core';

// ID branding from shared/types
import {
  type NpcId,
  type CharacterId,
  type InstanceId,
  type SceneId,
  type LocationId,
  type AssetId,
  NpcId as toNpcId,
  CharacterId as toCharacterId,
  InstanceId as toInstanceId,
  SceneId as toSceneId,
  LocationId as toLocationId,
  AssetId as toAssetId,
} from '@shared/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of normalizing a raw value to a canonical ref.
 */
export type NormalizeResult<T extends EntityRef> =
  | { success: true; ref: T; rawValue: string | number }
  | { success: false; error: string; rawValue: unknown };

/**
 * Options for ref normalization.
 */
export interface NormalizeOptions {
  /** If true, UUID strings are treated as character instances by default */
  uuidAsInstance?: boolean;
  /** Scene type for scene refs (default: 'game') */
  sceneType?: 'game' | 'content';
}

// ============================================================================
// NPC Reference Helpers
// ============================================================================

/**
 * Normalize a raw NPC value to a canonical NpcRef.
 *
 * Accepts:
 * - number: Treated as NPC ID (e.g., 123 -> "npc:123")
 * - string number: Treated as NPC ID (e.g., "123" -> "npc:123")
 * - NpcRef: Passed through (e.g., "npc:123")
 *
 * @param value - Raw NPC ID or ref
 * @returns Normalized NpcRef or error
 */
export function normalizeNpcRef(value: unknown): NormalizeResult<NpcRef> {
  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid NpcRef
  if (typeof value === 'string' && isNpcRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'npc') {
      return { success: true, ref: value as NpcRef, rawValue: parsed.id };
    }
  }

  // Number ID
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return { success: false, error: `Invalid NPC ID: ${value}`, rawValue: value };
    }
    return { success: true, ref: Ref.npc(toNpcId(value)), rawValue: value };
  }

  // String number
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isInteger(num) && num >= 0) {
      return { success: true, ref: Ref.npc(toNpcId(num)), rawValue: num };
    }
  }

  return { success: false, error: `Cannot normalize to NpcRef: ${value}`, rawValue: value };
}

/**
 * Extract NPC ID from a ref or raw value.
 */
export function extractNpcIdFromRef(value: unknown): NpcId | null {
  const result = normalizeNpcRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'npc' ? parsed.id : null;
}

// ============================================================================
// Character Instance Reference Helpers
// ============================================================================

/**
 * Normalize a raw character instance value to a canonical InstanceRef.
 *
 * Accepts:
 * - UUID string: Treated as instance ID (e.g., "abc-123..." -> "instance:abc-123...")
 * - InstanceRef: Passed through (e.g., "instance:abc-123...")
 *
 * @param value - Raw instance ID or ref
 * @returns Normalized InstanceRef or error
 */
export function normalizeInstanceRef(value: unknown): NormalizeResult<InstanceRef> {
  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid InstanceRef
  if (typeof value === 'string' && isInstanceRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'instance') {
      return { success: true, ref: value as InstanceRef, rawValue: parsed.id };
    }
  }

  // UUID string
  if (typeof value === 'string' && isUUID(value)) {
    return { success: true, ref: Ref.instance(toInstanceId(value)), rawValue: value };
  }

  return { success: false, error: `Cannot normalize to InstanceRef: ${value}`, rawValue: value };
}

/**
 * Extract instance ID from a ref or raw value.
 */
export function extractInstanceIdFromRef(value: unknown): InstanceId | null {
  const result = normalizeInstanceRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'instance' ? parsed.id : null;
}

// ============================================================================
// Character Template Reference Helpers
// ============================================================================

/**
 * Normalize a raw character template value to a canonical CharacterRef.
 *
 * Accepts:
 * - UUID string: Treated as character ID (e.g., "abc-123..." -> "character:abc-123...")
 * - CharacterRef: Passed through (e.g., "character:abc-123...")
 *
 * @param value - Raw character ID or ref
 * @returns Normalized CharacterRef or error
 */
export function normalizeCharacterRef(value: unknown): NormalizeResult<CharacterRef> {
  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid CharacterRef
  if (typeof value === 'string' && isCharacterRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'character') {
      return { success: true, ref: value as CharacterRef, rawValue: parsed.id };
    }
  }

  // UUID string
  if (typeof value === 'string' && isUUID(value)) {
    return { success: true, ref: Ref.character(toCharacterId(value)), rawValue: value };
  }

  return { success: false, error: `Cannot normalize to CharacterRef: ${value}`, rawValue: value };
}

/**
 * Extract character ID from a ref or raw value.
 */
export function extractCharacterIdFromRef(value: unknown): CharacterId | null {
  const result = normalizeCharacterRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'character' ? parsed.id : null;
}

// ============================================================================
// Scene Reference Helpers
// ============================================================================

/**
 * Normalize a raw scene value to a canonical SceneIdRef.
 *
 * Accepts:
 * - number: Treated as scene ID (e.g., 123 -> "scene:game:123")
 * - string number: Treated as scene ID (e.g., "123" -> "scene:game:123")
 * - SceneIdRef: Passed through (e.g., "scene:game:123")
 *
 * @param value - Raw scene ID or ref
 * @param options - Normalization options
 * @returns Normalized SceneIdRef or error
 */
export function normalizeSceneRef(
  value: unknown,
  options?: NormalizeOptions
): NormalizeResult<SceneIdRef> {
  const sceneType = options?.sceneType ?? 'game';

  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid SceneIdRef
  if (typeof value === 'string' && isSceneIdRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'scene') {
      return { success: true, ref: value as SceneIdRef, rawValue: parsed.id };
    }
  }

  // Number ID
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return { success: false, error: `Invalid scene ID: ${value}`, rawValue: value };
    }
    return { success: true, ref: Ref.scene(toSceneId(value), sceneType), rawValue: value };
  }

  // String number
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isInteger(num) && num >= 0) {
      return { success: true, ref: Ref.scene(toSceneId(num), sceneType), rawValue: num };
    }
  }

  return { success: false, error: `Cannot normalize to SceneIdRef: ${value}`, rawValue: value };
}

/**
 * Extract scene ID from a ref or raw value.
 */
export function extractSceneIdFromRef(value: unknown): SceneId | null {
  const result = normalizeSceneRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'scene' ? parsed.id : null;
}

// ============================================================================
// Location Reference Helpers
// ============================================================================

/**
 * Normalize a raw location value to a canonical LocationRef.
 */
export function normalizeLocationRef(value: unknown): NormalizeResult<LocationRef> {
  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid LocationRef
  if (typeof value === 'string' && isLocationRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'location') {
      return { success: true, ref: value as LocationRef, rawValue: parsed.id };
    }
  }

  // Number ID
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return { success: false, error: `Invalid location ID: ${value}`, rawValue: value };
    }
    return { success: true, ref: Ref.location(toLocationId(value)), rawValue: value };
  }

  // String number
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isInteger(num) && num >= 0) {
      return { success: true, ref: Ref.location(toLocationId(num)), rawValue: num };
    }
  }

  return { success: false, error: `Cannot normalize to LocationRef: ${value}`, rawValue: value };
}

/**
 * Extract location ID from a ref or raw value.
 */
export function extractLocationIdFromRef(value: unknown): LocationId | null {
  const result = normalizeLocationRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'location' ? parsed.id : null;
}

// ============================================================================
// Asset Reference Helpers
// ============================================================================

/**
 * Normalize a raw asset value to a canonical AssetRef.
 */
export function normalizeAssetRef(value: unknown): NormalizeResult<AssetRef> {
  if (value === null || value === undefined) {
    return { success: false, error: 'Value is null or undefined', rawValue: value };
  }

  // Already a valid AssetRef
  if (typeof value === 'string' && isAssetRef(value)) {
    const parsed = parseRef(value);
    if (parsed?.type === 'asset') {
      return { success: true, ref: value as AssetRef, rawValue: parsed.id };
    }
  }

  // Number ID
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return { success: false, error: `Invalid asset ID: ${value}`, rawValue: value };
    }
    return { success: true, ref: Ref.asset(toAssetId(value)), rawValue: value };
  }

  // String number
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isInteger(num) && num >= 0) {
      return { success: true, ref: Ref.asset(toAssetId(num)), rawValue: num };
    }
  }

  return { success: false, error: `Cannot normalize to AssetRef: ${value}`, rawValue: value };
}

/**
 * Extract asset ID from a ref or raw value.
 */
export function extractAssetIdFromRef(value: unknown): AssetId | null {
  const result = normalizeAssetRef(value);
  if (!result.success) return null;

  const parsed = parseRef(result.ref);
  return parsed?.type === 'asset' ? parsed.id : null;
}

// ============================================================================
// Generic Ref Utilities
// ============================================================================

/**
 * Try to parse any entity ref from a string.
 * Returns the parsed ref or null if invalid.
 */
export function tryParseEntityRef(value: unknown): ParsedRef | null {
  if (typeof value !== 'string') return null;
  return parseRef(value);
}

/**
 * Check if a value is already a valid entity ref of any type.
 */
export function isAnyEntityRef(value: unknown): value is EntityRef {
  if (typeof value !== 'string') return false;
  return parseRef(value) !== null;
}

/**
 * Batch normalize multiple refs of mixed types.
 * Returns an object with the same keys, but with normalized refs or null for failures.
 */
export function normalizeRefBatch<T extends Record<string, unknown>>(
  values: T,
  typeMap: { [K in keyof T]?: 'npc' | 'character' | 'instance' | 'scene' | 'location' | 'asset' }
): { [K in keyof T]: EntityRef | null } {
  const result = {} as { [K in keyof T]: EntityRef | null };

  for (const key of Object.keys(values) as (keyof T)[]) {
    const value = values[key];
    const type = typeMap[key];

    if (!type || value === undefined || value === null) {
      result[key] = null;
      continue;
    }

    let normalized: NormalizeResult<EntityRef>;
    switch (type) {
      case 'npc':
        normalized = normalizeNpcRef(value);
        break;
      case 'character':
        normalized = normalizeCharacterRef(value);
        break;
      case 'instance':
        normalized = normalizeInstanceRef(value);
        break;
      case 'scene':
        normalized = normalizeSceneRef(value);
        break;
      case 'location':
        normalized = normalizeLocationRef(value);
        break;
      case 'asset':
        normalized = normalizeAssetRef(value);
        break;
      default:
        result[key] = null;
        continue;
    }

    result[key] = normalized.success ? normalized.ref : null;
  }

  return result;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  // ID types from @shared/types
  type NpcId,
  type CharacterId,
  type InstanceId,
  type SceneId,
  type LocationId,
  type AssetId,
  // Ref types from @pixsim7/shared.ref-core
  type NpcRef,
  type CharacterRef,
  type InstanceRef,
  type SceneIdRef,
  type LocationRef,
  type AssetRef,
  type EntityRef,
  type ParsedRef,
  Ref,
  parseRef,
  isUUID,
};
