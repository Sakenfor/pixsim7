import { BaseAuthoringProjectBundleContributor } from './contributorClass';
import type { AuthoringProjectBundleContributor, ProjectBundleInventorySchema } from './types';

export interface ParsedSnapshotPayload<TSnapshot> {
  version: number;
  items: TSnapshot[];
}

export interface ApiSnapshotAuthoringContributorConfig<
  TExportSource,
  TSnapshot,
  TPayload,
> {
  key: string;
  version: number;
  inventory?: ProjectBundleInventorySchema;
  listExportSources: () => Promise<TExportSource[]>;
  sourceToSnapshot: (
    source: TExportSource,
  ) => Promise<TSnapshot | null | undefined> | TSnapshot | null | undefined;
  buildPayload: (snapshots: TSnapshot[], version: number) => TPayload | null;
  parsePayload: (
    payload: unknown,
    version: number,
  ) => ParsedSnapshotPayload<TSnapshot> | null;
  listExistingIds: () => Promise<Set<string>>;
  getSnapshotId: (snapshot: TSnapshot) => string;
  createFromSnapshot: (snapshot: TSnapshot) => Promise<void>;
  updateFromSnapshot: (snapshot: TSnapshot) => Promise<void>;
  invalidPayloadWarning?: string;
  onVersionMismatch?: (payloadVersion: number, version: number) => void;
  formatImportWarning?: (snapshotId: string, error: unknown) => string;
}

class ApiSnapshotAuthoringContributor<
  TExportSource,
  TSnapshot,
  TPayload,
> extends BaseAuthoringProjectBundleContributor<TPayload> {
  key: string;
  version: number;
  inventory?: ProjectBundleInventorySchema;
  private readonly config: ApiSnapshotAuthoringContributorConfig<TExportSource, TSnapshot, TPayload>;

  constructor(
    config: ApiSnapshotAuthoringContributorConfig<TExportSource, TSnapshot, TPayload>,
  ) {
    super();
    this.config = config;
    this.key = config.key;
    this.version = config.version;
    this.inventory = config.inventory;
  }

  protected async onExport() {
    const sources = await this.config.listExportSources();
    const snapshots: TSnapshot[] = [];

    for (const source of sources) {
      const snapshot = await this.config.sourceToSnapshot(source);
      if (snapshot != null) {
        snapshots.push(snapshot);
      }
    }

    return this.config.buildPayload(snapshots, this.version);
  }

  protected async onImport(payload: TPayload) {
    const parsed = this.config.parsePayload(payload, this.version);
    if (!parsed) {
      return {
        warnings: [
          this.config.invalidPayloadWarning ??
            `${this.key} payload is invalid and was ignored`,
        ],
      };
    }

    if (parsed.version !== this.version) {
      if (this.config.onVersionMismatch) {
        this.config.onVersionMismatch(parsed.version, this.version);
      }
    }

    const warnings: string[] = [];
    const existingIds = await this.config.listExistingIds();

    for (const snapshot of parsed.items) {
      const snapshotId = this.config.getSnapshotId(snapshot).trim();
      if (!snapshotId) {
        continue;
      }

      try {
        if (existingIds.has(snapshotId)) {
          await this.config.updateFromSnapshot(snapshot);
        } else {
          await this.config.createFromSnapshot(snapshot);
          existingIds.add(snapshotId);
        }
      } catch (error) {
        if (this.config.formatImportWarning) {
          warnings.push(this.config.formatImportWarning(snapshotId, error));
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`${this.key} import ${snapshotId}: ${message}`);
      }
    }

    return warnings.length > 0 ? { warnings } : {};
  }
}

export function createApiSnapshotAuthoringContributor<
  TExportSource,
  TSnapshot,
  TPayload,
>(
  config: ApiSnapshotAuthoringContributorConfig<TExportSource, TSnapshot, TPayload>,
): AuthoringProjectBundleContributor<TPayload> {
  return new ApiSnapshotAuthoringContributor(config).toContributor();
}
