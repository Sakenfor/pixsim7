import type {
  FlowGraphV1,
  FlowResolveRequest,
  FlowResolveResponse,
} from '@pixsim7/shared.types';

import { pixsimClient } from '@lib/api/client';

export interface FlowGraphLoadResult {
  graph: FlowGraphV1 | null;
  error?: string;
}

export async function loadFlowGraph(): Promise<FlowGraphLoadResult> {
  try {
    const graph = await pixsimClient.get<FlowGraphV1>('/dev/flows/graph');
    return { graph };
  } catch (error) {
    return { graph: null, error: getErrorMessage(error) };
  }
}

export async function resolveFlowGraph(
  payload: FlowResolveRequest
): Promise<FlowResolveResponse> {
  return pixsimClient.post<FlowResolveResponse>('/dev/flows/resolve', payload);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to load flow graph';
}
