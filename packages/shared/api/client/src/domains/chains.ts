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

export interface ExecutionPolicyV1Input {
  version?: 1;
  dispatch_mode?: 'single' | 'fanout' | 'sequential';
  wait_policy?: 'none' | 'terminal_per_step' | 'terminal_final';
  dependency_mode?: 'none' | 'previous' | 'explicit';
  failure_policy?: 'stop' | 'continue';
  concurrency?: number;
  step_timeout_seconds?: number;
  force_new?: boolean;
}

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
  execution_policy?: ExecutionPolicyV1Input;
  execution_metadata?: Record<string, unknown>;
}

export interface ExecuteEphemeralChainRequest extends ExecuteChainRequest {
  name?: string;
  description?: string;
  steps: ChainStepDefinition[];
  chain_metadata?: Record<string, unknown>;
}

export interface FanoutItemRequest {
  id: string;
  label?: string;
  params: Record<string, unknown>;
  operation?: string;
  provider_id?: string;
  workspace_id?: number | null;
  preferred_account_id?: number | null;
  name?: string;
  description?: string;
  priority?: number;
  force_new?: boolean;
  use_previous_output_as_input?: boolean;
}

export interface ExecuteEphemeralFanoutRequest {
  provider_id: string;
  default_operation?: string;
  workspace_id?: number | null;
  preferred_account_id?: number | null;
  continue_on_error?: boolean;
  force_new?: boolean;
  execution_policy?: ExecutionPolicyV1Input;
  items: FanoutItemRequest[];
  execution_metadata?: Record<string, unknown>;
  name?: string;
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

    async executeEphemeralChain(
      request: ExecuteEphemeralChainRequest,
    ): Promise<ExecuteChainResponse> {
      return client.post<ExecuteChainResponse>(
        '/generation-chains/execute-ephemeral',
        request,
      );
    },

    async executeEphemeralFanout(
      request: ExecuteEphemeralFanoutRequest,
    ): Promise<ExecuteChainResponse> {
      return client.post<ExecuteChainResponse>(
        '/generation-chains/execute-fanout-ephemeral',
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
