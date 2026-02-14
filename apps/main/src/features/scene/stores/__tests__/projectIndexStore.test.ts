import { describe, it, expect, beforeEach } from 'vitest';

import { useProjectIndexStore } from '../projectIndexStore';

function getState() {
  return useProjectIndexStore.getState();
}

function makeProject(overrides: {
  id: number;
  name?: string;
  updated_at?: string;
}) {
  return {
    id: overrides.id,
    name: overrides.name ?? `Project ${overrides.id}`,
    source_world_id: null as number | null,
    schema_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('projectIndexStore', () => {
  beforeEach(() => {
    getState().clear();
  });

  describe('setProjects', () => {
    it('sorts by updated_at descending', () => {
      getState().setProjects([
        makeProject({ id: 1, updated_at: '2026-01-01T00:00:00Z' }),
        makeProject({ id: 2, updated_at: '2026-01-03T00:00:00Z' }),
        makeProject({ id: 3, updated_at: '2026-01-02T00:00:00Z' }),
      ]);

      const ids = getState().projects.map((p) => p.id);
      expect(ids).toEqual([2, 3, 1]);
    });

    it('auto-selects first project when none selected', () => {
      getState().setProjects([
        makeProject({ id: 5, updated_at: '2026-01-01T00:00:00Z' }),
        makeProject({ id: 10, updated_at: '2026-01-02T00:00:00Z' }),
      ]);

      // Most recent (id=10) should be first after sort
      expect(getState().selectedProjectId).toBe(10);
    });

    it('preserves selection when selected project still exists', () => {
      getState().setProjects([makeProject({ id: 5 }), makeProject({ id: 10 })]);
      getState().selectProject(5);

      getState().setProjects([makeProject({ id: 5 }), makeProject({ id: 10 })]);
      expect(getState().selectedProjectId).toBe(5);
    });

    it('falls back to first when selected project disappears', () => {
      getState().setProjects([makeProject({ id: 5 }), makeProject({ id: 10 })]);
      getState().selectProject(10);

      getState().setProjects([makeProject({ id: 5 })]);
      expect(getState().selectedProjectId).toBe(5);
    });
  });

  describe('upsertProject', () => {
    it('adds new project and re-sorts', () => {
      getState().setProjects([makeProject({ id: 1 })]);
      getState().upsertProject(makeProject({ id: 2, updated_at: '2026-02-01T00:00:00Z' }));

      expect(getState().projects).toHaveLength(2);
      expect(getState().projects[0].id).toBe(2);
    });

    it('replaces existing project', () => {
      getState().setProjects([makeProject({ id: 1, name: 'Old' })]);
      getState().upsertProject(makeProject({ id: 1, name: 'New' }));

      expect(getState().projects).toHaveLength(1);
      expect(getState().projects[0].name).toBe('New');
    });
  });

  describe('removeProject', () => {
    it('removes specified project', () => {
      getState().setProjects([makeProject({ id: 1 }), makeProject({ id: 2 })]);
      getState().removeProject(1);

      expect(getState().projects).toHaveLength(1);
      expect(getState().projects[0].id).toBe(2);
    });

    it('auto-selects next project when active one removed', () => {
      getState().setProjects([
        makeProject({ id: 1, updated_at: '2026-01-01T00:00:00Z' }),
        makeProject({ id: 2, updated_at: '2026-01-02T00:00:00Z' }),
      ]);
      getState().selectProject(2);

      getState().removeProject(2);
      expect(getState().selectedProjectId).toBe(1);
    });

    it('selects null when last project removed', () => {
      getState().setProjects([makeProject({ id: 1 })]);
      getState().removeProject(1);

      expect(getState().selectedProjectId).toBeNull();
    });
  });

  describe('selectProject', () => {
    it('selects an existing project', () => {
      getState().setProjects([makeProject({ id: 1 }), makeProject({ id: 2 })]);
      getState().selectProject(1);

      expect(getState().selectedProjectId).toBe(1);
    });

    it('ignores non-existent project', () => {
      getState().setProjects([makeProject({ id: 1 })]);
      getState().selectProject(1);
      getState().selectProject(999);

      expect(getState().selectedProjectId).toBe(1);
    });

    it('allows null to deselect', () => {
      getState().setProjects([makeProject({ id: 1 })]);
      getState().selectProject(1);
      getState().selectProject(null);

      expect(getState().selectedProjectId).toBeNull();
    });
  });
});
