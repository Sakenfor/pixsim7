/**
 * Block authoring method registry.
 *
 * Methods register themselves at module load (via their own index.ts).
 * The Block Authoring panel reads from the registry to populate its
 * method picker — so adding a new method is one new directory + one
 * `registerBlockAuthoringMethod()` call, no panel changes required.
 */

import type { BlockAuthoringMethod } from './types';

const methods = new Map<string, BlockAuthoringMethod>();

export function registerBlockAuthoringMethod(method: BlockAuthoringMethod): void {
  if (methods.has(method.id)) {
    // Re-registering the same id is harmless (HMR), but warn so duplicate
    // ids from different modules don't silently collide.
    if (methods.get(method.id) !== method) {
       
      console.warn(`[block-authoring] method "${method.id}" already registered; overwriting.`);
    }
  }
  methods.set(method.id, method);
}

export function listBlockAuthoringMethods(): BlockAuthoringMethod[] {
  return Array.from(methods.values()).sort((a, b) => {
    const ao = a.order ?? 100;
    const bo = b.order ?? 100;
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
}

export function getBlockAuthoringMethod(id: string): BlockAuthoringMethod | undefined {
  return methods.get(id);
}
