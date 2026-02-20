import { pixsimClient } from '@devtools/mainApp/lib/api/client';
import { extractErrorMessage } from '@devtools/mainApp/lib/api/errorHandling';
import { createCodegenApi } from '@pixsim7/shared.api.client/domains';

export type {
  CodegenTask,
  CodegenTasksResponse,
  CodegenRunRequest,
  CodegenRunResponse,
} from '@pixsim7/shared.api.client/domains';

const codegenApi = createCodegenApi(pixsimClient);

export const listCodegenTasks = codegenApi.listTasks;
export const runCodegenTask = codegenApi.runTask;

export { extractErrorMessage };
