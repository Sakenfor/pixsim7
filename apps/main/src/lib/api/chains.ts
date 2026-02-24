/**
 * Chains API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createChainsApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  ChainSummary,
  ChainDetail,
  ChainStepDefinition,
  ChainExecution,
  GuidanceInheritFlags,
  ChainExecutionStatus,
  ChainStepState,
  CreateChainRequest,
  UpdateChainRequest,
  ExecuteChainRequest,
  ExecuteChainResponse,
  ListChainsQuery,
} from '@pixsim7/shared.api.client/domains';

const chainsApi = createChainsApi(pixsimClient);

export const listChains = chainsApi.listChains;
export const getChain = chainsApi.getChain;
export const createChain = chainsApi.createChain;
export const updateChain = chainsApi.updateChain;
export const deleteChain = chainsApi.deleteChain;
export const executeChain = chainsApi.executeChain;
export const getExecution = chainsApi.getExecution;
export const listExecutions = chainsApi.listExecutions;
