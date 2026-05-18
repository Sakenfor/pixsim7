/**
 * Per-kind entity-ref strategy
 *
 * Object-core refactor (plan `gameobject-runtime-refactor-v1`, step `ref-strategy`):
 * the kind-conditional ref construction that used to live as a hardcoded
 * `switch` inside `GameRuntime.buildEntityRef` is extracted here as a registry
 * so it is reachable from both `GameRuntime` and `GameObjectEntity`.
 *
 * This is a byte-identical extraction - given the same already-normalized
 * inputs, the output matches the previous switch exactly (verified by tests).
 */

import { Ref } from '@pixsim7/shared.ref.core';
import type { EntityRef } from '@pixsim7/shared.types';

/** Kinds that map to canonical typed numeric refs (numeric id required). */
const TYPED_NUMERIC_REF_BUILDERS: Record<string, (id: number) => EntityRef> = {
  npc: (id) => Ref.npc(id) as EntityRef,
  location: (id) => Ref.location(id) as EntityRef,
  scene: (id) => Ref.scene(id) as EntityRef,
  asset: (id) => Ref.asset(id) as EntityRef,
  generation: (id) => Ref.generation(id) as EntityRef,
  world: (id) => Ref.world(id) as EntityRef,
  session: (id) => Ref.session(id) as EntityRef,
};

/**
 * Kinds that always serialize as a verbatim `kind:id` string ref. Unlike the
 * default branch, the id is NOT numeric-normalized here (e.g. `item:007` stays
 * `item:007`).
 */
const VERBATIM_STRING_REF_KINDS = new Set(['item', 'prop', 'trigger', 'player']);

/**
 * Build an `EntityRef` for one already-normalized kind/id.
 *
 * Callers are responsible for normalization (trim, runtime-kind aliasing,
 * id→string) and the empty/undefined guards; this function only owns the
 * kind→ref dispatch that was previously the `switch`.
 *
 * @param normalizedKind trimmed + runtime-kind-normalized kind
 * @param normalizedId   trimmed string form of the id
 * @param numeric        `Number(normalizedId)`
 * @param hasNumber      `Number.isFinite(numeric)`
 */
export function buildEntityRefForKind(
  normalizedKind: string,
  normalizedId: string,
  numeric: number,
  hasNumber: boolean
): EntityRef {
  const typed = TYPED_NUMERIC_REF_BUILDERS[normalizedKind];
  if (typed) {
    return hasNumber
      ? typed(numeric)
      : (`${normalizedKind}:${normalizedId}` as EntityRef);
  }
  if (VERBATIM_STRING_REF_KINDS.has(normalizedKind)) {
    return `${normalizedKind}:${normalizedId}` as EntityRef;
  }
  return hasNumber
    ? (`${normalizedKind}:${numeric}` as EntityRef)
    : (`${normalizedKind}:${normalizedId}` as EntityRef);
}
