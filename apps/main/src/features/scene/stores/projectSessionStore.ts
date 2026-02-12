import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { createBackendStorage } from '@lib/utils';

export interface ProjectSessionSnapshot {
  sourceFileName: string | null;
  schemaVersion: number | null;
  extensionKeys: string[];
  extensionWarnings: string[];
  coreWarnings: string[];
  dirty: boolean;
  lastImportedAt: number | null;
  lastExportedAt: number | null;
  lastOperation: 'import' | 'export' | null;
}

interface RecordProjectImportInput {
  sourceFileName?: string | null;
  schemaVersion?: number | null;
  extensionKeys?: string[];
  extensionWarnings?: string[];
  coreWarnings?: string[];
}

interface RecordProjectExportInput {
  sourceFileName?: string | null;
  schemaVersion?: number | null;
  extensionKeys?: string[];
  extensionWarnings?: string[];
}

interface ProjectSessionActions {
  recordImport: (input: RecordProjectImportInput) => void;
  recordExport: (input: RecordProjectExportInput) => void;
  setDirty: (dirty: boolean) => void;
  reset: () => void;
}

type ProjectSessionStore = ProjectSessionSnapshot & ProjectSessionActions;

const STORAGE_KEY = 'project_session_v1';

const initialState: ProjectSessionSnapshot = {
  sourceFileName: null,
  schemaVersion: null,
  extensionKeys: [],
  extensionWarnings: [],
  coreWarnings: [],
  dirty: false,
  lastImportedAt: null,
  lastExportedAt: null,
  lastOperation: null,
};

function toStringArray(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export const useProjectSessionStore = create<ProjectSessionStore>()(
  persist(
    (set) => ({
      ...initialState,

      recordImport: (input) => {
        const importedAt = Date.now();
        set((state) => ({
          ...state,
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

      reset: () => set({ ...initialState }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => createBackendStorage('project-session')),
      version: 1,
      partialize: (state) => ({
        sourceFileName: state.sourceFileName,
        schemaVersion: state.schemaVersion,
        extensionKeys: state.extensionKeys,
        extensionWarnings: state.extensionWarnings,
        coreWarnings: state.coreWarnings,
        dirty: state.dirty,
        lastImportedAt: state.lastImportedAt,
        lastExportedAt: state.lastExportedAt,
        lastOperation: state.lastOperation,
      }),
    },
  ),
);
