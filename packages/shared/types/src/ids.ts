/**
 * Canonical Entity ID Types
 *
 * Type-safe, branded ID types for entity references throughout the system.
 * Compile-time only — no runtime overhead.
 *
 * ## Two sources, one re-export
 *
 *   - `ids.generated.ts` — auto-discovered int-keyed entities from
 *     backend `entity_ref.py` (AssetId, NpcId, GenerationId, ...).
 *     Regenerated via `pnpm branded:gen`.
 *   - This file — UUID-keyed entities and the `ParsedRef` discriminated
 *     union. Manual because UUID entities don't fit the `EntityRef`
 *     int-id contract used by the backend declarations.
 *
 * Both files share the same `Brand` symbol via `_brand.ts`, so branded
 * identity is consistent across the package.
 *
 * ## Import patterns
 *
 * ```typescript
 * // Branded ID types and constructors
 * import { NpcId, AssetId, CharacterId } from '@pixsim7/shared.types';
 * const npcId: NpcId = NpcId(123);
 *
 * // Ref types
 * import type { NpcRef, AssetRef } from '@pixsim7/shared.types';
 *
 * // Ref runtime functions
 * import { Ref, isNpcRef, parseRef, extractNpcId } from '@pixsim7/shared.ref.core';
 * ```
 *
 * @module ids
 */

import type { Brand } from './_brand';

// ============================================================================
// AUTO-DISCOVERED ENTITY TYPES (re-exported from generated file)
// ============================================================================

export * from './ids.generated';

// ============================================================================
// REF TYPES FROM REF-CORE
// ============================================================================
// For Ref builders/guards/parsers, import from @pixsim7/shared.ref.core directly.

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
} from '@pixsim7/shared.ref.core';

import type { SceneType } from '@pixsim7/shared.ref.core';
import type {
  NpcId,
  LocationId,
  SceneId,
  AssetId,
  GenerationId,
  WorldId,
  SessionId,
} from './ids.generated';

// ============================================================================
// FRONTEND-ONLY ASSET ID REFINEMENTS
// ============================================================================
// The auto-generated `AssetId` represents a backend asset ID (always
// positive — backend EntityRef IDs come from a postgres sequence).
// Local-only assets (not yet uploaded) carry synthetic *negative* IDs,
// which are meaningful only client-side. Passing one to a backend route
// will 404 silently.

/**
 * Frontend-only synthetic asset ID for unuploaded local files.
 * Always a negative integer. Produced by `hashStringToStableNegativeId`.
 */
export type LocalAssetId = Brand<number, 'LocalAssetId'>;

/**
 * Either a backend asset ID (positive) or a local-only ID (negative).
 * Use at boundaries that handle both kinds. Narrow via `isBackendAssetId`
 * (or `assertBackendAssetId`) before passing to backend routes.
 */
export type AnyAssetId = import('./ids.generated').AssetId | LocalAssetId;

/** Construct a LocalAssetId from a number (no sign check — callers ensure). */
export const LocalAssetId = (n: number): LocalAssetId => n as LocalAssetId;

// ============================================================================
// UUID-BASED IDS (Distributed Identity)
// ============================================================================
// These entities use UUIDs as primary keys, so they can't be auto-generated
// from `entity_ref.py` (which assumes int IDs).

/** Character template ID (characters.id - UUID) */
export type CharacterId = Brand<string, 'CharacterId'>;

/** Character instance ID (character_instances.id - UUID) */
export type InstanceId = Brand<string, 'InstanceId'>;

/** Prompt version ID (prompt_versions.id - UUID) */
export type PromptVersionId = Brand<string, 'PromptVersionId'>;

/** Action block ID (action_blocks.id - UUID) */
export type ActionBlockId = Brand<string, 'ActionBlockId'>;

// ============================================================================
// ID CONSTRUCTORS for UUID types
// ============================================================================

/** Create a branded CharacterId from a UUID string */
export const CharacterId = (uuid: string): CharacterId => uuid as CharacterId;

/** Create a branded InstanceId from a UUID string */
export const InstanceId = (uuid: string): InstanceId => uuid as InstanceId;

/** Create a branded PromptVersionId from a UUID string */
export const PromptVersionId = (uuid: string): PromptVersionId => uuid as PromptVersionId;

/** Create a branded ActionBlockId from a UUID string */
export const ActionBlockId = (uuid: string): ActionBlockId => uuid as ActionBlockId;

// ============================================================================
// PARSED REF (with branded IDs)
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
