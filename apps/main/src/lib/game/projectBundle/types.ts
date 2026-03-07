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

export interface ProjectBundleInventoryCategorySchema {
  key: string;
  label?: string;
  path?: string;
  idFields?: string[];
  labelFields?: string[];
  panelId?: string;
  panelLabel?: string;
}

export interface ProjectBundleInventorySchema {
  categories: ProjectBundleInventoryCategorySchema[];
}

export interface ProjectBundleExtensionHandler<TPayload = unknown> {
  key: string;
  version?: number;
  inventory?: ProjectBundleInventorySchema;
  migrate?: (payload: unknown, fromVersion: number, toVersion: number) => TPayload | null;
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
  version?: number;
  inventory?: ProjectBundleInventorySchema;
  migrate?: (payload: unknown, fromVersion: number, toVersion: number) => TPayload | null;
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
  migrated: string[];
  failed: string[];
}

export interface ExportWorldProjectWithExtensionsResult {
  bundle: GameProjectBundle;
  extensionReport: ProjectBundleExtensionExportReport;
}

export interface ImportWorldProjectWithExtensionsResult {
  response: GameProjectImportResponse;
  extensionReport: ProjectBundleExtensionImportReport;
}
