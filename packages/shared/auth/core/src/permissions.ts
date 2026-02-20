import type { User } from './types';

export const CODEGEN_PERMISSION = 'devtools.codegen';

/**
 * Canonical admin role check.
 */
export function isAdminUser(user: User | null | undefined): boolean {
  return user?.role === 'admin' || user?.is_admin === true;
}

/**
 * Canonical scoped permission check.
 */
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user || !permission) {
    return false;
  }

  const target = permission.trim().toLowerCase();
  if (!target) {
    return false;
  }

  return (user.permissions || []).some((raw) => raw.trim().toLowerCase() === target);
}

export function canRunCodegen(user: User | null | undefined): boolean {
  return hasPermission(user, CODEGEN_PERMISSION);
}
