/**
 * Block authoring method types.
 *
 * The Block Authoring panel is a generic shell that hosts pluggable
 * "authoring methods" — different ways to author block primitives.
 *
 * v1 ships only the CUE pack method (user-owned packs in DB drafts).
 * Future methods could include: direct YAML editing, AI-assisted authoring,
 * or admin-only canonical core_* pack editing on disk.
 */

import type { User } from '@pixsim7/shared.auth.core';
import type { ComponentType } from 'react';

export interface BlockAuthoringMethodContext {
  /** The currently focused block id from the embedded Block Explorer, if any. */
  selectedBlockId?: string | null;
}

export interface BlockAuthoringMethodProps {
  context: BlockAuthoringMethodContext;
}

export interface BlockAuthoringMethod {
  /** Stable identifier (e.g. "cue-pack"). */
  id: string;
  /** Short label shown in the method picker. */
  label: string;
  /** One-line description shown under the picker. */
  description: string;
  /** Optional icon name (lucide). */
  icon?: string;
  /** Optional ordering hint (lower = earlier). */
  order?: number;
  /**
   * Optional availability predicate. When set, the panel shell hides
   * this method from the picker for users that don't match. Use the
   * established auth utilities — `isAdminUser(user)` for admin-only
   * methods, `hasPermission(user, 'foo.bar')` for permission-gated
   * ones — so the same gate logic matches the backend's auth deps.
   *
   * A future admin-only "core pack" method (editing canonical
   * tools/cue/prompt_packs/core_*.cue files on disk) would set:
   *   isAvailable: (user) => isAdminUser(user)
   * paired with backend endpoints behind `CurrentAdminUser`.
   *
   * The predicate must be a pure function — it's called on every
   * auth state change.
   */
  isAvailable?: (user: User | null) => boolean;
  /** The editor surface for this method. Renders within the panel body. */
  Editor: ComponentType<BlockAuthoringMethodProps>;
}
