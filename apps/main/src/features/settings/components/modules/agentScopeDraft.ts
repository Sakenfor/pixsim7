import type { AdminAgentProfile } from '@lib/api';

// Editable draft of an agent profile's three scope grant fields, as the
// Settings → Access pickers manipulate them (agent-scope-admin-ux cp2).
//
// `default_scopes` is a single backend list that mixes world and project grants
// (`world:<id>` / `world:*` / `project:<id>`); the UI splits it into a worlds and
// a projects picker, so this module owns the load (split) ↔ save (merge) seam.
// Kept import-light (type-only `@lib/api`) so it's unit-testable without dragging
// in the app's store singletons.

export type ScopeDraft = {
  plans: string[];
  worlds: string[];
  projects: string[];
  contracts: string[];
};

export const EMPTY_DRAFT: ScopeDraft = { plans: [], worlds: [], projects: [], contracts: [] };

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

/** Empty selection → null = unrestricted (full access). The explicit deny-all ([])
 *  tri-state is cp3; cp2 preserves the prior blank-means-unrestricted behaviour. */
export function listOrNull(items: string[]): string[] | null {
  return items.length > 0 ? items : null;
}

export function draftFor(p: AdminAgentProfile): ScopeDraft {
  const { worlds, projects } = splitDefaultScopes(p.default_scopes);
  return {
    plans: p.assigned_plans ?? [],
    worlds,
    projects,
    contracts: p.allowed_contracts ?? [],
  };
}

export function draftEquals(a: ScopeDraft, b: ScopeDraft): boolean {
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  return (
    same(a.plans, b.plans) &&
    same(a.worlds, b.worlds) &&
    same(a.projects, b.projects) &&
    same(a.contracts, b.contracts)
  );
}
