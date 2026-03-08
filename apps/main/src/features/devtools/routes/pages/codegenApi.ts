/**
 * Codegen API wrapper for main app
 *
 * Wraps the shared codegen API domain client with the main app's pixsimClient.
 */
import { pixsimClient } from '@lib/api/client';
import { createCodegenApi } from '@pixsim7/shared.api.client/domains';

export type {
  CodegenTask,
  CodegenTasksResponse,
  CodegenRunRequest,
  CodegenRunResponse,
  MigrationScope,
  MigrationScopeDetail,
  MigrationStatusResponse,
  MigrationRunRequest,
  MigrationRunResponse,
  MigrationHeadResponse,
} from '@pixsim7/shared.api.client/domains';

export { extractErrorMessage } from '@pixsim7/shared.api.client';

const codegenApi = createCodegenApi(pixsimClient);

export const listCodegenTasks = codegenApi.listTasks;
export const runCodegenTask = codegenApi.runTask;
export const getMigrationStatus = codegenApi.getMigrationStatus;
export const getMigrationHead = codegenApi.getMigrationHead;
export const runMigration = codegenApi.runMigration;
