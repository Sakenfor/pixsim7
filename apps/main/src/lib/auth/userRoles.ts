import type { User } from '@pixsim7/shared.auth.core';

/**
 * Canonical admin user check for frontend gates.
 */
export function isAdminUser(user: User | null | undefined): boolean {
  return user?.role === 'admin' || user?.is_admin === true;
}

