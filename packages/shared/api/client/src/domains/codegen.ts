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
  };
}
