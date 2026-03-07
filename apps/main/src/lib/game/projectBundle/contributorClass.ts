import type {
  AuthoringProjectBundleContributor,
  ProjectBundleExportContext,
  ProjectBundleExtensionImportOutcome,
  ProjectBundleImportContext,
  ProjectBundleInventorySchema,
} from './types';

export interface AuthoringProjectBundleContributorAdapter<TPayload = unknown> {
  key: string;
  toContributor(): AuthoringProjectBundleContributor<TPayload>;
}

export type AuthoringProjectBundleContributorLike<TPayload = unknown> =
  | AuthoringProjectBundleContributor<TPayload>
  | AuthoringProjectBundleContributorAdapter<TPayload>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasStringKey(value: unknown): value is { key: string } {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.key === 'string' && value.key.trim().length > 0;
}

function isContributorAdapter<TPayload = unknown>(
  candidate: unknown,
): candidate is AuthoringProjectBundleContributorAdapter<TPayload> {
  if (!hasStringKey(candidate)) {
    return false;
  }
  return typeof (candidate as { toContributor?: unknown }).toContributor === 'function';
}

function isPlainContributor<TPayload = unknown>(
  candidate: unknown,
): candidate is AuthoringProjectBundleContributor<TPayload> {
  return hasStringKey(candidate);
}

export function isAuthoringProjectBundleContributorLike(
  candidate: unknown,
): candidate is AuthoringProjectBundleContributorLike<unknown> {
  return isPlainContributor(candidate) || isContributorAdapter(candidate);
}

export function normalizeAuthoringProjectBundleContributor<TPayload = unknown>(
  contributor: AuthoringProjectBundleContributorLike<TPayload>,
): AuthoringProjectBundleContributor<TPayload> {
  if (isContributorAdapter<TPayload>(contributor)) {
    return contributor.toContributor();
  }
  return contributor;
}

export abstract class BaseAuthoringProjectBundleContributor<TPayload = unknown>
  implements AuthoringProjectBundleContributorAdapter<TPayload>
{
  abstract key: string;
  version?: number;
  inventory?: ProjectBundleInventorySchema;

  protected onMigrate?(
    payload: unknown,
    fromVersion: number,
    toVersion: number,
  ): TPayload | null;

  protected onExport?(
    context: ProjectBundleExportContext,
  ): Promise<TPayload | null | undefined> | TPayload | null | undefined;

  protected onImport?(
    payload: TPayload,
    context: ProjectBundleImportContext,
  ):
    | Promise<ProjectBundleExtensionImportOutcome | void>
    | ProjectBundleExtensionImportOutcome
    | void;

  protected onGetDirtyState?(): boolean;
  protected onClearDirtyState?(): void;
  protected onSubscribeDirtyState?(
    listener: (dirty: boolean) => void,
  ): (() => void) | void;

  toContributor(): AuthoringProjectBundleContributor<TPayload> {
    return {
      key: this.key,
      version: this.version,
      inventory: this.inventory,
      migrate: this.onMigrate
        ? (payload, fromVersion, toVersion) =>
            this.onMigrate!(payload, fromVersion, toVersion)
        : undefined,
      export: this.onExport ? (context) => this.onExport!(context) : undefined,
      import: this.onImport ? (payload, context) => this.onImport!(payload, context) : undefined,
      getDirtyState: this.onGetDirtyState ? () => this.onGetDirtyState!() : undefined,
      clearDirtyState: this.onClearDirtyState ? () => this.onClearDirtyState!() : undefined,
      subscribeDirtyState: this.onSubscribeDirtyState
        ? (listener) => this.onSubscribeDirtyState!(listener)
        : undefined,
    };
  }
}
