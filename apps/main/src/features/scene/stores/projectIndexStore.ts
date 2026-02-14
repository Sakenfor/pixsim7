import { create } from 'zustand';

import type { SavedGameProjectSummary } from '@lib/api';

interface ProjectIndexState {
  projects: SavedGameProjectSummary[];
  selectedProjectId: number | null;
  lastSyncedAt: number | null;
  setProjects: (projects: SavedGameProjectSummary[]) => void;
  upsertProject: (project: SavedGameProjectSummary) => void;
  removeProject: (projectId: number) => void;
  selectProject: (projectId: number | null) => void;
  clear: () => void;
}

function parseSortTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortProjects(projects: SavedGameProjectSummary[]): SavedGameProjectSummary[] {
  return [...projects].sort((a, b) => {
    const updatedDelta = parseSortTimestamp(b.updated_at) - parseSortTimestamp(a.updated_at);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return b.id - a.id;
  });
}

export const useProjectIndexStore = create<ProjectIndexState>((set) => ({
  projects: [],
  selectedProjectId: null,
  lastSyncedAt: null,

  setProjects: (projects) =>
    set((state) => {
      const nextProjects = sortProjects(projects);
      const hasSelected =
        state.selectedProjectId != null && nextProjects.some((project) => project.id === state.selectedProjectId);

      return {
        projects: nextProjects,
        selectedProjectId: hasSelected ? state.selectedProjectId : (nextProjects[0]?.id ?? null),
        lastSyncedAt: Date.now(),
      };
    }),

  upsertProject: (project) =>
    set((state) => {
      const withoutExisting = state.projects.filter((entry) => entry.id !== project.id);
      const nextProjects = sortProjects([...withoutExisting, project]);

      return {
        projects: nextProjects,
        selectedProjectId:
          state.selectedProjectId === null || state.selectedProjectId === project.id
            ? project.id
            : state.selectedProjectId,
      };
    }),

  removeProject: (projectId) =>
    set((state) => {
      const nextProjects = state.projects.filter((entry) => entry.id !== projectId);
      const selectedProjectId =
        state.selectedProjectId === projectId ? (nextProjects[0]?.id ?? null) : state.selectedProjectId;

      return {
        projects: nextProjects,
        selectedProjectId,
      };
    }),

  selectProject: (projectId) =>
    set((state) => {
      if (projectId == null) {
        return { selectedProjectId: null };
      }

      const exists = state.projects.some((project) => project.id === projectId);
      return { selectedProjectId: exists ? projectId : state.selectedProjectId };
    }),

  clear: () =>
    set({
      projects: [],
      selectedProjectId: null,
      lastSyncedAt: null,
    }),
}));
