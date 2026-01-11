/**
 * Auto-generated branded ID types from OpenAPI x-entity-type extensions.
 * DO NOT EDIT MANUALLY - regenerate with: pnpm branded:gen
 *
 * This file complements ids.ts with auto-discovered entity types.
 */

// ============================================================================
// BRAND SYMBOL (shared with ids.ts)
// ============================================================================

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================================================
// AUTO-DISCOVERED ENTITY TYPES
// These types were found via x-entity-type in the OpenAPI schema
// ============================================================================

// Branded numeric IDs
export type AccountId = Brand<number, 'AccountId'>;
export type AssetId = Brand<number, 'AssetId'>;
export type GenerationId = Brand<number, 'GenerationId'>;
export type UserId = Brand<number, 'UserId'>;
export type WorkspaceId = Brand<number, 'WorkspaceId'>;

// String reference types
export type AccountRef = `account:${number}`;
export type AssetRef = `asset:${number}`;
export type GenerationRef = `generation:${number}`;
export type UserRef = `user:${number}`;
export type WorkspaceRef = `workspace:${number}`;

// ============================================================================
// ID CONSTRUCTORS
// ============================================================================

export const AccountId = (n: number): AccountId => n as AccountId;
export const AssetId = (n: number): AssetId => n as AssetId;
export const GenerationId = (n: number): GenerationId => n as GenerationId;
export const UserId = (n: number): UserId => n as UserId;
export const WorkspaceId = (n: number): WorkspaceId => n as WorkspaceId;

// ============================================================================
// REF BUILDERS
// ============================================================================

export const Ref = {
  account: (id: AccountId | number): AccountRef => `account:${id}` as AccountRef,
  asset: (id: AssetId | number): AssetRef => `asset:${id}` as AssetRef,
  generation: (id: GenerationId | number): GenerationRef => `generation:${id}` as GenerationRef,
  user: (id: UserId | number): UserRef => `user:${id}` as UserRef,
  workspace: (id: WorkspaceId | number): WorkspaceRef => `workspace:${id}` as WorkspaceRef,
} as const;

// ============================================================================
// ENTITY TYPE REGISTRY
// List of all discovered entity types for runtime use
// ============================================================================

export const ENTITY_TYPES = [
  'account',
  'asset',
  'generation',
  'user',
  'workspace',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
