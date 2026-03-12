import { pixsimClient } from '@devtools/mainApp/lib/api/client';
import { extractErrorMessage } from '@devtools/mainApp/lib/api/errorHandling';
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
  MigrationHealthResponse,
  MigrationChainHealth,
  MigrationSnapshotRequest,
  MigrationSnapshotResponse,
  MigrationReapplyRequest,
  MigrationReapplyResponse,
} from '@pixsim7/shared.api.client/domains';

const codegenApi = createCodegenApi(pixsimClient);

export const listCodegenTasks = codegenApi.listTasks;
export const runCodegenTask = codegenApi.runTask;
export const getMigrationStatus = codegenApi.getMigrationStatus;
export const getMigrationHead = codegenApi.getMigrationHead;
export const runMigration = codegenApi.runMigration;
export const getMigrationHealth = codegenApi.getMigrationHealth;
export const snapshotMigrationHealth = codegenApi.snapshotMigrationHealth;
export const reapplyDirtyMigration = codegenApi.reapplyDirtyMigration;

export { extractErrorMessage };
