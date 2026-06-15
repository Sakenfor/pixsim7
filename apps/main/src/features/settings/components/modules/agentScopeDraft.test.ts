import { describe, expect, it } from 'vitest';

import {
  denyAllowed,
  draftEquals,
  draftFor,
  draftToScopeUpdate,
  fieldFromList,
  fieldToList,
  mergeDefaultScopes,
  scopeFieldFromStrings,
  splitDefaultScopes,
  type ScopeDraft,
} from './agentScopeDraft';

// agent-scope-admin-ux cp2/cp3: each scope field is a tri-state mapping 1:1 to the
// resolver (pixsim7/common/scope_grants.py): null = unrestricted, [] = deny-all,
// [ids] = restricted. Deny-all is only representable for the dedicated []-capable
// fields (plan/contract); world/project ride default_scopes scope-strings where
// [] reads back as unrestricted, so they are two-state only. These tests pin both
// the per-field codec and the default_scopes split/merge seam.

describe('denyAllowed', () => {
  it('allows deny-all only for the dedicated []-capable fields', () => {
    expect(denyAllowed('plans')).toBe(true);
    expect(denyAllowed('contracts')).toBe(true);
    expect(denyAllowed('worlds')).toBe(false);
    expect(denyAllowed('projects')).toBe(false);
  });
});

describe('fieldFromList (load dedicated field)', () => {
  it('null → unrestricted', () => {
    expect(fieldFromList(null)).toEqual({ mode: 'unrestricted', ids: [] });
  });
  it('[] → deny-all', () => {
    expect(fieldFromList([])).toEqual({ mode: 'deny', ids: [] });
  });
  it('[ids] → restricted', () => {
    expect(fieldFromList(['plan-a', 'plan-b'])).toEqual({
      mode: 'restricted',
      ids: ['plan-a', 'plan-b'],
    });
  });
});

describe('fieldToList (save dedicated field)', () => {
  it('unrestricted → null, deny → [], restricted → ids', () => {
    expect(fieldToList({ mode: 'unrestricted', ids: [] })).toBeNull();
    expect(fieldToList({ mode: 'deny', ids: [] })).toEqual([]);
    expect(fieldToList({ mode: 'restricted', ids: ['x'] })).toEqual(['x']);
  });

  it('round-trips null/[]/[ids] losslessly', () => {
    for (const v of [null, [], ['a', 'b']] as Array<string[] | null>) {
      expect(fieldToList(fieldFromList(v))).toEqual(v);
    }
  });
});

describe('scopeFieldFromStrings (world/project, two-state)', () => {
  it('present scope-strings → restricted; absent → unrestricted', () => {
    expect(scopeFieldFromStrings(['world:1'])).toEqual({ mode: 'restricted', ids: ['world:1'] });
    expect(scopeFieldFromStrings([])).toEqual({ mode: 'unrestricted', ids: [] });
  });
});

describe('splitDefaultScopes', () => {
  it('routes project: entries to projects and everything else to worlds', () => {
    const { worlds, projects } = splitDefaultScopes(['world:42', 'project:7', 'world:*']);
    expect(worlds).toEqual(['world:42', 'world:*']);
    expect(projects).toEqual(['project:7']);
  });
  it('treats null/empty as empty selections', () => {
    expect(splitDefaultScopes(null)).toEqual({ worlds: [], projects: [] });
    expect(splitDefaultScopes([])).toEqual({ worlds: [], projects: [] });
  });
});

describe('mergeDefaultScopes', () => {
  it('only restricted fields contribute; worlds then projects', () => {
    const merged = mergeDefaultScopes(
      { mode: 'restricted', ids: ['world:1', 'world:*'] },
      { mode: 'restricted', ids: ['project:9'] },
    );
    expect(merged).toEqual(['world:1', 'world:*', 'project:9']);
  });
  it('unrestricted fields contribute nothing; both unrestricted → null', () => {
    expect(
      mergeDefaultScopes({ mode: 'restricted', ids: ['world:1'] }, { mode: 'unrestricted', ids: [] }),
    ).toEqual(['world:1']);
    expect(
      mergeDefaultScopes({ mode: 'unrestricted', ids: [] }, { mode: 'unrestricted', ids: [] }),
    ).toBeNull();
  });
});

describe('draftFor / draftToScopeUpdate full round-trip', () => {
  const profile = {
    id: 'collab-claude',
    user_id: 7,
    label: 'Collaborator',
    agent_type: 'claude',
    status: 'active',
    is_global: false,
    assigned_plans: ['plan-a'],
    default_scopes: ['world:42', 'project:3'],
    allowed_contracts: null,
  };

  it('builds a per-kind tri-state draft, splitting default_scopes', () => {
    expect(draftFor(profile)).toEqual({
      plans: { mode: 'restricted', ids: ['plan-a'] },
      worlds: { mode: 'restricted', ids: ['world:42'] },
      projects: { mode: 'restricted', ids: ['project:3'] },
      contracts: { mode: 'unrestricted', ids: [] },
    });
  });

  it('serializes back to the original grant fields', () => {
    expect(draftToScopeUpdate(draftFor(profile))).toEqual({
      assigned_plans: ['plan-a'],
      default_scopes: ['world:42', 'project:3'],
      allowed_contracts: null,
    });
  });

  it('represents deny-all for plan/contract but never silently for worlds', () => {
    const draft: ScopeDraft = {
      plans: { mode: 'deny', ids: [] },
      worlds: { mode: 'unrestricted', ids: [] },
      projects: { mode: 'unrestricted', ids: [] },
      contracts: { mode: 'deny', ids: [] },
    };
    expect(draftToScopeUpdate(draft)).toEqual({
      assigned_plans: [],
      default_scopes: null,
      allowed_contracts: [],
    });
  });
});

describe('draftEquals', () => {
  const profile = {
    id: 'p',
    user_id: 7,
    label: 'P',
    agent_type: 'claude',
    status: 'active',
    is_global: false,
    assigned_plans: ['plan-a'],
    default_scopes: ['world:42'],
    allowed_contracts: null,
  };

  it('equal to itself', () => {
    expect(draftEquals(draftFor(profile), draftFor(profile))).toBe(true);
  });
  it('detects a changed mode', () => {
    const a = draftFor(profile);
    const b: ScopeDraft = { ...a, plans: { mode: 'deny', ids: [] } };
    expect(draftEquals(a, b)).toBe(false);
  });
  it('detects a changed selection', () => {
    const a = draftFor(profile);
    const b: ScopeDraft = { ...a, worlds: { mode: 'restricted', ids: ['world:42', 'world:99'] } };
    expect(draftEquals(a, b)).toBe(false);
  });
});
