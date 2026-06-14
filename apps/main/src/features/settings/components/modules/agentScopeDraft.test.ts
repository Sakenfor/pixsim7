import { describe, expect, it } from 'vitest';

import { draftEquals, draftFor, listOrNull, splitDefaultScopes } from './agentScopeDraft';

// cp2 (agent-scope-admin-ux): default_scopes is a single grant list mixing world
// and project scopes. The pickers split it per-kind on load and re-merge on save;
// these helpers are the load/save seam, so the round-trip must be lossless and the
// null-vs-list semantics must match the resolver (empty selection = unrestricted).

describe('splitDefaultScopes', () => {
  it('routes project: entries to projects and everything else to worlds', () => {
    const { worlds, projects } = splitDefaultScopes(['world:42', 'project:7', 'world:*']);
    expect(worlds).toEqual(['world:42', 'world:*']);
    expect(projects).toEqual(['project:7']);
  });

  it('treats null/empty as empty selections (unrestricted)', () => {
    expect(splitDefaultScopes(null)).toEqual({ worlds: [], projects: [] });
    expect(splitDefaultScopes([])).toEqual({ worlds: [], projects: [] });
  });

  it('keeps world:* on the world side, not projects', () => {
    const { worlds, projects } = splitDefaultScopes(['world:*']);
    expect(worlds).toEqual(['world:*']);
    expect(projects).toEqual([]);
  });
});

describe('listOrNull', () => {
  it('returns null for an empty selection (unrestricted)', () => {
    expect(listOrNull([])).toBeNull();
  });

  it('returns the list when non-empty (restricted)', () => {
    expect(listOrNull(['plan-a', 'plan-b'])).toEqual(['plan-a', 'plan-b']);
  });
});

describe('default_scopes round-trip (load split → save merge)', () => {
  it('reconstructs the merged grant from the split worlds/projects drafts', () => {
    const original = ['world:1', 'world:*', 'project:9'];
    const { worlds, projects } = splitDefaultScopes(original);
    const merged = listOrNull([...worlds, ...projects]);
    // worlds preserved in order, then projects appended.
    expect(merged).toEqual(['world:1', 'world:*', 'project:9']);
  });

  it('clearing both kinds saves null (back to unrestricted)', () => {
    const merged = listOrNull([]);
    expect(merged).toBeNull();
  });
});

describe('draftFor / draftEquals', () => {
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

  it('builds a per-kind draft from a profile, splitting default_scopes', () => {
    const d = draftFor(profile);
    expect(d).toEqual({
      plans: ['plan-a'],
      worlds: ['world:42'],
      projects: ['project:3'],
      contracts: [],
    });
  });

  it('round-trips equal: draftFor(profile) equals itself', () => {
    expect(draftEquals(draftFor(profile), draftFor(profile))).toBe(true);
  });

  it('detects a changed selection', () => {
    const a = draftFor(profile);
    const b = { ...a, worlds: ['world:42', 'world:99'] };
    expect(draftEquals(a, b)).toBe(false);
  });
});
