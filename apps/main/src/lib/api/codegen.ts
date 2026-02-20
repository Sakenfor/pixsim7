/**
 * Devtools codegen API client helpers.
 */

import { pixsimClient } from './client';
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
