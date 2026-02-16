/**
 * Admin codegen API client helpers.
 */

import { pixsimClient } from './client';

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

export async function listCodegenTasks(): Promise<CodegenTasksResponse> {
  return pixsimClient.get<CodegenTasksResponse>('/admin/codegen/tasks');
}

export async function runCodegenTask(request: CodegenRunRequest): Promise<CodegenRunResponse> {
  return pixsimClient.post<CodegenRunResponse>('/admin/codegen/run', request);
}

