import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createBackendStorage } from '@lib/utils';

export interface ProjectSessionSnapshot {
  currentProjectId: number | null;
  currentProjectName: string | null;
  currentProjectSourceWorldId: number | null;
  currentProjectUpdatedAt: string | null;
  sourceFileName: string | null;
  schemaVersion: number | null;
  extensionKeys: string[];
  extensionWarnings: string[];
  coreWarnings: string[];
  dirty: boolean;
  lastAutosavedAt: number | null;
  lastImportedAt: number | null;
  lastExportedAt: number | null;
  lastOperation: 'import' | 'export' | null;
}

export interface SetCurrentProjectInput {
  projectId: number | null;
  projectName?: string | null;
  projectSourceWorldId?: number | null;
  projectUpdatedAt?: string | null;
}

interface RecordProjectImportInput {
  projectId?: number | null;
  projectName?: string | null;
  projectSourceWorldId?: number | null;
  projectUpdatedAt?: string | null;
  sourceFileName?: string | null;
  schemaVersion?: number | null;
  extensionKeys?: string[];
  extensionWarnings?: string[];
  coreWarnings?: string[];
}

interface RecordProjectExportInput {
  projectId?: number | null;
  projectName?: string | null;
  projectSourceWorldId?: number | null;
  projectUpdatedAt?: string | null;
  sourceFileName?: string | null;
  schemaVersion?: number | null;
  extensionKeys?: string[];
  extensionWarnings?: string[];
}

interface ProjectSessionActions {
  setCurrentProject: (input: SetCurrentProjectInput) => void;
  clearCurrentProject: () => void;
  recordImport: (input: RecordProjectImportInput) => void;
  recordExport: (input: RecordProjectExportInput) => void;
  setDirty: (dirty: boolean) => void;
  setLastAutosavedAt: (ts: number) => void;
  reset: () => void;
}

type ProjectSessionStore = ProjectSessionSnapshot & ProjectSessionActions;

const STORAGE_KEY = 'project_session_v1';

const initialState: ProjectSessionSnapshot = {
  currentProjectId: null,
  currentProjectName: null,
  currentProjectSourceWorldId: null,
  currentProjectUpdatedAt: null,
  sourceFileName: null,
  schemaVersion: null,
  extensionKeys: [],
  extensionWarnings: [],
  coreWarnings: [],
  dirty: false,
  lastAutosavedAt: null,
  lastImportedAt: null,
  lastExportedAt: null,
  lastOperation: null,
};

function toStringArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function toProjectId(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function toProjectName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toProjectTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export const useProjectSessionStore = create<ProjectSessionStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentProject: (input) => {
        const projectId = toProjectId(input.projectId);
        if (!projectId) {
          set(() => ({
            currentProjectId: null,
            currentProjectName: null,
            currentProjectSourceWorldId: null,
            currentProjectUpdatedAt: null,
          }));
          return;
        }

        set((state) => ({
          currentProjectId: projectId,
          currentProjectName: toProjectName(input.projectName) ?? state.currentProjectName,
          currentProjectSourceWorldId:
            toProjectId(input.projectSourceWorldId) ?? state.currentProjectSourceWorldId,
          currentProjectUpdatedAt:
            toProjectTimestamp(input.projectUpdatedAt) ?? state.currentProjectUpdatedAt,
        }));
      },

      clearCurrentProject: () =>
        set(() => ({
          currentProjectId: null,
          currentProjectName: null,
          currentProjectSourceWorldId: null,
          currentProjectUpdatedAt: null,
        })),

      recordImport: (input) => {
        const importedAt = Date.now();
        set((state) => ({
          ...state,
          currentProjectId: toProjectId(input.projectId),
          currentProjectName:
            toProjectName(input.projectName) ?? toProjectName(input.sourceFileName),
          currentProjectSourceWorldId: toProjectId(input.projectSourceWorldId),
          currentProjectUpdatedAt: toProjectTimestamp(input.projectUpdatedAt),
          sourceFileName: input.sourceFileName ?? state.sourceFileName,
          schemaVersion: input.schemaVersion ?? state.schemaVersion,
          extensionKeys: toStringArray(input.extensionKeys),
          extensionWarnings: toStringArray(input.extensionWarnings),
          coreWarnings: toStringArray(input.coreWarnings),
          dirty: false,
          lastImportedAt: importedAt,
          lastOperation: 'import',
        }));
      },

      recordExport: (input) => {
        const exportedAt = Date.now();
        set((state) => ({
          ...state,
          currentProjectId: toProjectId(input.projectId) ?? state.currentProjectId,
          currentProjectName:
            toProjectName(input.projectName) ??
            toProjectName(input.sourceFileName) ??
            state.currentProjectName,
          currentProjectSourceWorldId:
            toProjectId(input.projectSourceWorldId) ?? state.currentProjectSourceWorldId,
          currentProjectUpdatedAt:
            toProjectTimestamp(input.projectUpdatedAt) ?? state.currentProjectUpdatedAt,
          sourceFileName: input.sourceFileName ?? state.sourceFileName,
          schemaVersion: input.schemaVersion ?? state.schemaVersion,
          extensionKeys: input.extensionKeys ? toStringArray(input.extensionKeys) : state.extensionKeys,
          extensionWarnings: toStringArray(input.extensionWarnings),
          lastExportedAt: exportedAt,
          lastOperation: 'export',
        }));
      },

      setDirty: (dirty) =>
        set((state) => (state.dirty === dirty ? state : { dirty })),

      setLastAutosavedAt: (ts) => set({ lastAutosavedAt: ts }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('project-session')),
      version: 1,
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        currentProjectName: state.currentProjectName,
        currentProjectSourceWorldId: state.currentProjectSourceWorldId,
        currentProjectUpdatedAt: state.currentProjectUpdatedAt,
        sourceFileName: state.sourceFileName,
        schemaVersion: state.schemaVersion,
        extensionKeys: state.extensionKeys,
        extensionWarnings: state.extensionWarnings,
        coreWarnings: state.coreWarnings,
        dirty: state.dirty,
        lastAutosavedAt: state.lastAutosavedAt,
        lastImportedAt: state.lastImportedAt,
        lastExportedAt: state.lastExportedAt,
        lastOperation: state.lastOperation,
      }),
    },
  ),
);

