/**
 * Codegen API Domain Client
 *
 * Shared client for devtools codegen task listing and execution.
 */
import type { PixSimApiClient } from '../client';

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

export function createCodegenApi(client: PixSimApiClient) {
  return {
    async listTasks(): Promise<CodegenTasksResponse> {
      return client.get<CodegenTasksResponse>('/devtools/codegen/tasks');
    },

    async runTask(request: CodegenRunRequest): Promise<CodegenRunResponse> {
      return client.post<CodegenRunResponse>('/devtools/codegen/run', request);
    },
  };
}
