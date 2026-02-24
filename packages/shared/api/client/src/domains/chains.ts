import type { PixSimApiClient } from '../client';
import type {
  ChainSummary,
  ChainDetail,
  ChainStepDefinition,
  ChainExecution,
  GuidanceInheritFlags,
  ChainExecutionStatus,
  ChainStepState,
} from '@pixsim7/shared.types';

export type {
  ChainSummary,
  ChainDetail,
  ChainStepDefinition,
  ChainExecution,
  GuidanceInheritFlags,
  ChainExecutionStatus,
  ChainStepState,
};

export interface CreateChainRequest {
  name: string;
  description?: string;
  steps: ChainStepDefinition[];
  tags?: string[];
  chain_metadata?: Record<string, unknown>;
  is_public?: boolean;
}

export interface UpdateChainRequest {
  name?: string;
  description?: string;
  steps?: ChainStepDefinition[];
  tags?: string[];
  chain_metadata?: Record<string, unknown>;
  is_public?: boolean;
}

export interface ExecuteChainRequest {
  provider_id: string;
  initial_asset_id?: number | null;
  default_operation?: string;
  workspace_id?: number | null;
  preferred_account_id?: number | null;
  step_timeout?: number;
  execution_metadata?: Record<string, unknown>;
}

export interface ExecuteChainResponse {
  execution_id: string;
  status: string;
  message: string;
}

export interface ListChainsQuery {
  is_public?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
}

export function createChainsApi(client: PixSimApiClient) {
  return {
    async listChains(query?: ListChainsQuery): Promise<ChainSummary[]> {
      const response = await client.get<readonly ChainSummary[]>(
        '/generation-chains',
        { params: query },
      );
      return [...response];
    },

    async getChain(chainId: string): Promise<ChainDetail> {
      return client.get<ChainDetail>(
        `/generation-chains/${encodeURIComponent(chainId)}`,
      );
    },

    async createChain(request: CreateChainRequest): Promise<ChainDetail> {
      return client.post<ChainDetail>('/generation-chains', request);
    },

    async updateChain(
      chainId: string,
      request: UpdateChainRequest,
    ): Promise<ChainDetail> {
      return client.patch<ChainDetail>(
        `/generation-chains/${encodeURIComponent(chainId)}`,
        request,
      );
    },

    async deleteChain(chainId: string): Promise<void> {
      await client.delete(
        `/generation-chains/${encodeURIComponent(chainId)}`,
      );
    },

    async executeChain(
      chainId: string,
      request: ExecuteChainRequest,
    ): Promise<ExecuteChainResponse> {
      return client.post<ExecuteChainResponse>(
        `/generation-chains/${encodeURIComponent(chainId)}/execute`,
        request,
      );
    },

    async getExecution(executionId: string): Promise<ChainExecution> {
      return client.get<ChainExecution>(
        `/generation-chains/executions/${encodeURIComponent(executionId)}`,
      );
    },

    async listExecutions(
      chainId: string,
      limit?: number,
    ): Promise<ChainExecution[]> {
      const params = limit != null ? { limit } : undefined;
      const response = await client.get<readonly ChainExecution[]>(
        `/generation-chains/${encodeURIComponent(chainId)}/executions`,
        { params },
      );
      return [...response];
    },
  };
}
