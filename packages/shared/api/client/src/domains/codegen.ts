/**
 * Codegen & Developer Tasks API Domain Client
 *
 * Shared client for devtools codegen task listing/execution
 * and database migration management.
 */
import type { PixSimApiClient } from '../client';

// ---------------------------------------------------------------------------
// Codegen Types
// ---------------------------------------------------------------------------

export interface CodegenTask {
  id: string;
  description: string;
  script: string;
  supports_check: boolean;
  groups: string[];
}

export interface CodegenTasksResponse {
  tasks: CodegenTask[];
  total: number;
}

export interface CodegenRunRequest {
  task_id: string;
  check?: boolean;
}

export interface CodegenRunResponse {
  task_id: string;
  ok: boolean;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Tests Runner Types
// ---------------------------------------------------------------------------

export type TestProfile = 'changed' | 'fast' | 'project-bundle' | 'full';

export interface TestRunRequest {
  profile: TestProfile;
  backend_only?: boolean;
  frontend_only?: boolean;
  list_only?: boolean;
}

export interface TestRunResponse {
  profile: TestProfile;
  ok: boolean;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
  backend_only: boolean;
  frontend_only: boolean;
  list_only: boolean;
}

// ---------------------------------------------------------------------------
// Migration Types
// ---------------------------------------------------------------------------

export type MigrationScope = 'all' | 'main' | 'game' | 'blocks' | 'logs';

export interface MigrationScopeDetail {
  scope: string;
  config_file: string;
  script_location: string;
  database_url: string;
  version_table: string;
  migration_count: number;
}

export interface MigrationStatusResponse {
  available: boolean;
  scopes: string[];
  scope_details: MigrationScopeDetail[];
}

export interface MigrationRunRequest {
  scope: MigrationScope;
}

export interface MigrationRunResponse {
  ok: boolean;
  scope: string;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

export interface MigrationHeadResponse {
  scope: string;
  current_head: string | null;
  is_head: boolean;
  error: string | null;
}

export interface MigrationHealthItem {
  revision: string;
  filename: string;
  path: string;
  sha256: string;
  down_revisions: string[];
  is_merge: boolean;
  is_applied: boolean;
  is_pending: boolean;
  is_dirty: boolean;
  is_current_head: boolean;
  is_script_head: boolean;
}

export interface MigrationChainHealth {
  scope: string;
  config_file: string;
  script_location: string;
  database_url: string;
  version_table: string;
  current_heads: string[];
  script_heads: string[];
  total_migrations: number;
  applied_count: number;
  pending_count: number;
  dirty_count: number;
  unknown_applied_revisions: string[];
  db_error: string | null;
  migrations: MigrationHealthItem[];
}

export interface MigrationHealthSummary {
  chains: number;
  dirty_chains: number;
  dirty_migrations: number;
  pending_migrations: number;
}

export interface MigrationHealthResponse {
  available: boolean;
  sidecar_path: string;
  sidecar_bootstrapped: boolean;
  summary: MigrationHealthSummary;
  chains: MigrationChainHealth[];
}

export interface MigrationSnapshotRequest {
  scope?: MigrationScope;
}

export interface MigrationSnapshotResponse {
  ok: boolean;
  scope: string;
  updated_revisions: number;
  sidecar_path: string;
}

export interface MigrationReapplyRequest {
  scope: Exclude<MigrationScope, 'all'>;
  revision: string;
}

export interface MigrationReapplyResponse {
  ok: boolean;
  scope: string;
  revision: string;
  downgrade_target: string;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Client Factory
// ---------------------------------------------------------------------------

export function createCodegenApi(client: PixSimApiClient) {
  return {
    async listTasks(): Promise<CodegenTasksResponse> {
      return client.get<CodegenTasksResponse>('/devtools/codegen/tasks');
    },

    async runTask(request: CodegenRunRequest): Promise<CodegenRunResponse> {
      return client.post<CodegenRunResponse>('/devtools/codegen/run', request);
    },

    async runTests(request: TestRunRequest): Promise<TestRunResponse> {
      return client.post<TestRunResponse>('/devtools/codegen/tests/run', request);
    },

    async getMigrationStatus(): Promise<MigrationStatusResponse> {
      return client.get<MigrationStatusResponse>('/devtools/codegen/migrations/status');
    },

    async getMigrationHead(scope: string): Promise<MigrationHeadResponse> {
      return client.get<MigrationHeadResponse>(`/devtools/codegen/migrations/${scope}/head`);
    },

    async runMigration(request: MigrationRunRequest): Promise<MigrationRunResponse> {
      return client.post<MigrationRunResponse>('/devtools/codegen/migrations/run', request);
    },

    async getMigrationHealth(): Promise<MigrationHealthResponse> {
      return client.get<MigrationHealthResponse>('/devtools/codegen/migrations/health');
    },

    async snapshotMigrationHealth(request: MigrationSnapshotRequest = {}): Promise<MigrationSnapshotResponse> {
      return client.post<MigrationSnapshotResponse>('/devtools/codegen/migrations/health/snapshot', request);
    },

    async reapplyDirtyMigration(request: MigrationReapplyRequest): Promise<MigrationReapplyResponse> {
      return client.post<MigrationReapplyResponse>('/devtools/codegen/migrations/health/reapply', request);
    },
  };
}
