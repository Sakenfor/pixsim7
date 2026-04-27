/**
 * Auto-generated branded ID types from backend entity_ref.py declarations.
 * DO NOT EDIT MANUALLY - regenerate with: pnpm branded:gen
 *
 * Source: pixsim7/backend/main/shared/schemas/entity_ref.py
 *
 * Only emits branded numeric IDs + their constructors and the entity-type
 * registry. String ref types and the `Ref` builder are owned by
 * `@pixsim7/shared.ref.core`, which has richer support (UUIDs, scene
 * subtypes, parsers).
 */

import type { Brand } from './_brand';

// ============================================================================
// BRANDED NUMERIC IDS
// ============================================================================

export type AccountId = Brand<number, 'AccountId'>;
export type AssetId = Brand<number, 'AssetId'>;
export type AssetBranchId = Brand<number, 'AssetBranchId'>;
export type BranchId = Brand<number, 'BranchId'>;
export type ClipId = Brand<number, 'ClipId'>;
export type GenerationId = Brand<number, 'GenerationId'>;
export type IntimacyId = Brand<number, 'IntimacyId'>;
export type LineageId = Brand<number, 'LineageId'>;
export type LocationId = Brand<number, 'LocationId'>;
export type MoodId = Brand<number, 'MoodId'>;
export type NpcId = Brand<number, 'NpcId'>;
export type PoseId = Brand<number, 'PoseId'>;
export type RatingId = Brand<number, 'RatingId'>;
export type SceneId = Brand<number, 'SceneId'>;
export type SessionId = Brand<number, 'SessionId'>;
export type SubmissionId = Brand<number, 'SubmissionId'>;
export type TagId = Brand<number, 'TagId'>;
export type UserId = Brand<number, 'UserId'>;
export type WorkspaceId = Brand<number, 'WorkspaceId'>;
export type WorldId = Brand<number, 'WorldId'>;

// ============================================================================
// ID CONSTRUCTORS
// ============================================================================

export const AccountId = (n: number): AccountId => n as AccountId;
export const AssetId = (n: number): AssetId => n as AssetId;
export const AssetBranchId = (n: number): AssetBranchId => n as AssetBranchId;
export const BranchId = (n: number): BranchId => n as BranchId;
export const ClipId = (n: number): ClipId => n as ClipId;
export const GenerationId = (n: number): GenerationId => n as GenerationId;
export const IntimacyId = (n: number): IntimacyId => n as IntimacyId;
export const LineageId = (n: number): LineageId => n as LineageId;
export const LocationId = (n: number): LocationId => n as LocationId;
export const MoodId = (n: number): MoodId => n as MoodId;
export const NpcId = (n: number): NpcId => n as NpcId;
export const PoseId = (n: number): PoseId => n as PoseId;
export const RatingId = (n: number): RatingId => n as RatingId;
export const SceneId = (n: number): SceneId => n as SceneId;
export const SessionId = (n: number): SessionId => n as SessionId;
export const SubmissionId = (n: number): SubmissionId => n as SubmissionId;
export const TagId = (n: number): TagId => n as TagId;
export const UserId = (n: number): UserId => n as UserId;
export const WorkspaceId = (n: number): WorkspaceId => n as WorkspaceId;
export const WorldId = (n: number): WorldId => n as WorldId;

// ============================================================================
// ENTITY TYPE REGISTRY
// ============================================================================

export const ENTITY_TYPES = [
  'account',
  'asset',
  'asset_branch',
  'branch',
  'clip',
  'generation',
  'intimacy',
  'lineage',
  'location',
  'mood',
  'npc',
  'pose',
  'rating',
  'scene',
  'session',
  'submission',
  'tag',
  'user',
  'workspace',
  'world',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
