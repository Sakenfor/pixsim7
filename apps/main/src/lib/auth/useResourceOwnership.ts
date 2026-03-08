/**
 * Hook for ownership checks on user-owned resources.
 *
 * Mirrors backend semantics from `services/ownership/user_owned.py`:
 * - `isMine`: current user owns the resource
 * - `canEdit`: current user can modify the resource (owner or admin)
 * - `ownerRef`: canonical `user:{id}` reference string
 */
import { useAuthStore } from '@pixsim7/shared.auth.core';

export interface ResourceOwnership {
  /** True when the current user is the resource owner. */
  isMine: boolean;
  /** True when the current user can modify the resource (owner or admin). */
  canEdit: boolean;
  /** Canonical owner reference string, e.g. `"user:7"`. Null if no owner. */
  ownerRef: string | null;
}

export function useResourceOwnership(
  ownerUserId: number | null | undefined,
): ResourceOwnership {
  const user = useAuthStore((s) => s.user);

  const numericUserId = user?.id != null ? Number(user.id) : null;
  const isMine =
    numericUserId != null &&
    ownerUserId != null &&
    numericUserId === ownerUserId;
  const isAdmin = user?.is_admin === true;

  return {
    isMine,
    canEdit: isMine || isAdmin,
    ownerRef: ownerUserId != null ? `user:${ownerUserId}` : null,
  };
}
