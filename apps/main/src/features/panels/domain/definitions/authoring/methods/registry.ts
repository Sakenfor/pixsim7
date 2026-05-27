/**
 * Block authoring method registry.
 *
 * Methods register themselves at module load (via their own index.ts).
 * The Block Authoring panel reads from the registry to populate its
 * method picker — so adding a new method is one new directory + one
 * `registerAuthoringMethod()` call, no panel changes required.
 */

import type { User } from '@pixsim7/shared.auth.core';

import type { AuthoringMethod } from './types';

const methods = new Map<string, AuthoringMethod>();

export function registerAuthoringMethod(method: AuthoringMethod): void {
  if (methods.has(method.id)) {
    // Re-registering the same id is harmless (HMR), but warn so duplicate
    // ids from different modules don't silently collide.
    if (methods.get(method.id) !== method) {
       
      console.warn(`[authoring] method "${method.id}" already registered; overwriting.`);
    }
  }
  methods.set(method.id, method);
}

export function listAuthoringMethods(): AuthoringMethod[] {
  return Array.from(methods.values()).sort((a, b) => {
    const ao = a.order ?? 100;
    const bo = b.order ?? 100;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

export function getAuthoringMethod(id: string): AuthoringMethod | undefined {
  return methods.get(id);
}

/**
 * Filter the registry against the supplied user. Methods without an
 * `isAvailable` predicate are always included; methods that opt into
 * a gate are kept only when the predicate returns true.
 *
 * Pure — safe to call inside `useMemo` against `useAuthStore`'s `user`.
 */
export function listAvailableAuthoringMethods(
  user: User | null,
): AuthoringMethod[] {
  return listAuthoringMethods().filter(
    (method) => !method.isAvailable || method.isAvailable(user),
  );
}

/**
 * Test-only: drop the entire registry. Useful so capability/gating
 * tests can register a clean set of methods per case and not leak
 * into siblings via the module-singleton Map.
 */
export function __resetAuthoringMethodsForTest(): void {
  methods.clear();
}
