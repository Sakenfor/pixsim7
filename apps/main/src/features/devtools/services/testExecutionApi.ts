import { extractErrorMessage } from '@pixsim7/shared.api.client';
import {
  createCodegenApi,
  type TestRunRequest,
  type TestRunResponse,
} from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from '@lib/api/client';


const codegenApi = createCodegenApi(pixsimClient);

export type { TestRunRequest, TestRunResponse };
export { extractErrorMessage };

export const runTestProfile = codegenApi.runTests;
