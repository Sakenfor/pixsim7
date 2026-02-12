import type { GameProjectBundle, GameProjectImportResponse } from '@lib/api';

export interface ProjectBundleExportContext {
  worldId: number;
  bundle: GameProjectBundle;
}

export interface ProjectBundleImportContext {
  bundle: GameProjectBundle;
  response: GameProjectImportResponse;
}

export interface ProjectBundleExtensionImportOutcome {
  warnings?: string[];
}

export interface ProjectBundleExtensionHandler<TPayload = unknown> {
  key: string;
  export?: (
    context: ProjectBundleExportContext,
  ) => Promise<TPayload | null | undefined> | TPayload | null | undefined;
  import?: (
    payload: TPayload,
    context: ProjectBundleImportContext,
  ) =>
    | Promise<ProjectBundleExtensionImportOutcome | void>
    | ProjectBundleExtensionImportOutcome
    | void;
}

export interface AuthoringProjectBundleContributor<TPayload = unknown> {
  key: string;
  export?: (
    context: ProjectBundleExportContext,
  ) => Promise<TPayload | null | undefined> | TPayload | null | undefined;
  import?: (
    payload: TPayload,
    context: ProjectBundleImportContext,
  ) =>
    | Promise<ProjectBundleExtensionImportOutcome | void>
    | ProjectBundleExtensionImportOutcome
    | void;
  getDirtyState?: () => boolean;
  clearDirtyState?: () => void;
  subscribeDirtyState?: (listener: (dirty: boolean) => void) => (() => void) | void;
}

export interface ProjectBundleExtensionExportReport {
  included: string[];
  skipped: string[];
  warnings: string[];
}

export interface ProjectBundleExtensionImportReport {
  applied: string[];
  skipped: string[];
  unknown: string[];
  warnings: string[];
}

export interface ExportWorldProjectWithExtensionsResult {
  bundle: GameProjectBundle;
  extensionReport: ProjectBundleExtensionExportReport;
}

export interface ImportWorldProjectWithExtensionsResult {
  response: GameProjectImportResponse;
  extensionReport: ProjectBundleExtensionImportReport;
}
