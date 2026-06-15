import type { AdminAgentProfile } from '@lib/api';

// Editable draft of an agent profile's three scope grant fields, as the
// Settings → Access pickers manipulate them (agent-scope-admin-ux cp2 + cp3).
//
// Each field is a tri-state that maps 1:1 to the resolver semantics
// (pixsim7/common/scope_grants.py): null = unrestricted, [] = deny-all,
// [ids] = restricted. This module owns that serialization seam so it stays
// import-light (type-only `@lib/api`) and unit-testable without the app's
// store singletons.
//
// IMPORTANT asymmetry: deny-all is only representable for the *dedicated* fields
// (`assigned_plans`, `allowed_contracts`), where the backend stores `[]` and the
// resolver reads it as deny-all. `world` / `project` ride the single
// `default_scopes` *scope-string* list, and `grants_from_scope_strings([])`
// returns NO grants = unrestricted — there is no "deny-all worlds" string today.
// So world/project expose only Unrestricted / Restricted (`denyAllowed: false`);
// granting deny-all there would need a parent-resolver change (deferred).

export type ScopeMode = 'unrestricted' | 'restricted' | 'deny';

/** One field's editable state: the chosen mode plus the ids selected when restricted. */
export type FieldDraft = { mode: ScopeMode; ids: string[] };

export type ScopeDraft = {
  plans: FieldDraft;
  worlds: FieldDraft;
  projects: FieldDraft;
  contracts: FieldDraft;
};

const UNRESTRICTED: FieldDraft = { mode: 'unrestricted', ids: [] };
export const EMPTY_DRAFT: ScopeDraft = {
  plans: UNRESTRICTED,
  worlds: UNRESTRICTED,
  projects: UNRESTRICTED,
  contracts: UNRESTRICTED,
};

/** Which scope kinds can express deny-all (a dedicated `[]`-capable backend field). */
export function denyAllowed(field: keyof ScopeDraft): boolean {
  return field === 'plans' || field === 'contracts';
}

/** Split a backend default_scopes list into its world and project halves.
 *  Any non-`project:` entry (`world:<id>`, `world:*`) is treated as a world. */
export function splitDefaultScopes(scopes: string[] | null): { worlds: string[]; projects: string[] } {
  const worlds: string[] = [];
  const projects: string[] = [];
  for (const s of scopes ?? []) {
    if (s.startsWith('project:')) projects.push(s);
    else worlds.push(s);
  }
  return { worlds, projects };
}

// --- Dedicated `[]`-capable field (plan / contract): full tri-state ---

/** Load a dedicated grant field: null → unrestricted, [] → deny-all, [ids] → restricted. */
export function fieldFromList(value: string[] | null): FieldDraft {
  if (value === null || value === undefined) return { mode: 'unrestricted', ids: [] };
  if (value.length === 0) return { mode: 'deny', ids: [] };
  return { mode: 'restricted', ids: value };
}

/** Save a dedicated grant field back to its null/[]/[ids] form. */
export function fieldToList(f: FieldDraft): string[] | null {
  if (f.mode === 'unrestricted') return null;
  if (f.mode === 'deny') return [];
  return f.ids; // restricted (empty restricted collapses to [] = deny-all, by design)
}

// --- Scope-string field (world / project under default_scopes): two-state ---

/** Load a world/project half: present scope-strings → restricted; absent → unrestricted.
 *  (No deny-all: an empty scope-string set means unrestricted, not deny.) */
export function scopeFieldFromStrings(scopes: string[]): FieldDraft {
  return scopes.length > 0 ? { mode: 'restricted', ids: scopes } : { mode: 'unrestricted', ids: [] };
}

/** Merge the world + project halves back into one default_scopes list.
 *  Only restricted fields contribute strings; if neither restricts → null (unrestricted). */
export function mergeDefaultScopes(worlds: FieldDraft, projects: FieldDraft): string[] | null {
  const out: string[] = [];
  if (worlds.mode === 'restricted') out.push(...worlds.ids);
  if (projects.mode === 'restricted') out.push(...projects.ids);
  return out.length > 0 ? out : null;
}

export function draftFor(p: AdminAgentProfile): ScopeDraft {
  const { worlds, projects } = splitDefaultScopes(p.default_scopes);
  return {
    plans: fieldFromList(p.assigned_plans),
    worlds: scopeFieldFromStrings(worlds),
    projects: scopeFieldFromStrings(projects),
    contracts: fieldFromList(p.allowed_contracts),
  };
}

/** Serialize a draft into the three backend grant fields for adminUpdateAgentProfileScope. */
export function draftToScopeUpdate(d: ScopeDraft): {
  assigned_plans: string[] | null;
  default_scopes: string[] | null;
  allowed_contracts: string[] | null;
} {
  return {
    assigned_plans: fieldToList(d.plans),
    default_scopes: mergeDefaultScopes(d.worlds, d.projects),
    allowed_contracts: fieldToList(d.contracts),
  };
}

export function draftEquals(a: ScopeDraft, b: ScopeDraft): boolean {
  const sameIds = (x: string[], y: string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i]);
  const sameField = (x: FieldDraft, y: FieldDraft) => x.mode === y.mode && sameIds(x.ids, y.ids);
  return (
    sameField(a.plans, b.plans) &&
    sameField(a.worlds, b.worlds) &&
    sameField(a.projects, b.projects) &&
    sameField(a.contracts, b.contracts)
  );
}
