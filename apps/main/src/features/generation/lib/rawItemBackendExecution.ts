import {
  executeEphemeralFanout,
  getExecution,
  type ChainExecution,
  type ExecuteEphemeralFanoutRequest,
} from '@lib/api/chains';

export type RawItemExecutionMode = 'fanout' | 'sequential';

export interface PollExecutionToTerminalOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function pollExecutionToTerminal(
  executionId: string,
  options: PollExecutionToTerminalOptions = {},
): Promise<ChainExecution> {
  const { pollIntervalMs = 1000, timeoutMs = 60 * 60 * 1000 } = options;
  const startedAt = Date.now();

  while (true) {
    const execution = await getExecution(executionId);
    if (isTerminalExecutionStatus(execution.status)) {
      return execution;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Execution polling timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export interface ExecuteTrackedRawItemBackendExecutionArgs {
  request: ExecuteEphemeralFanoutRequest;
  total: number;
  executionMode: RawItemExecutionMode;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (progress: { queued: number; total: number }, execution: ChainExecution) => void;
}

export interface ExecuteTrackedRawItemBackendExecutionResult {
  execution: ChainExecution;
  generationIds: number[];
}

export async function executeTrackedRawItemBackendExecution(
  args: ExecuteTrackedRawItemBackendExecutionArgs,
): Promise<ExecuteTrackedRawItemBackendExecutionResult> {
  const {
    request,
    total,
    executionMode,
    pollIntervalMs = 1000,
    timeoutMs = 60 * 60 * 1000,
    onProgress,
  } = args;

  const started = await executeEphemeralFanout(request);
  const startedAt = Date.now();
  let execution: ChainExecution | null = null;

  while (true) {
    const state = await getExecution(started.execution_id);
    execution = state;
    onProgress?.(
      { queued: countRawItemExecutionProgress(state, executionMode), total },
      state,
    );
    if (isTerminalExecutionStatus(state.status)) {
      break;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Execution polling timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!execution) {
    throw new Error('Missing execution state after raw-item backend execution');
  }

  return {
    execution,
    generationIds: extractGenerationIdsFromExecution(execution),
  };
}

export function extractGenerationIdsFromExecution(execution: ChainExecution): number[] {
  return (Array.isArray(execution.step_states) ? execution.step_states : [])
    .map((s: any) => s?.generation_id)
    .filter((id: any): id is number => typeof id === 'number');
}

export function extractLastAssetIdFromExecution(execution: ChainExecution): number | null {
  const states = Array.isArray(execution.step_states) ? execution.step_states : [];
  for (let i = states.length - 1; i >= 0; i -= 1) {
    const row = states[i];
    const a = row?.result_asset_id ?? row?.asset_id;
    if (typeof a === 'number') return a;
  }
  return null;
}

export function countRawItemExecutionProgress(
  execution: ChainExecution,
  executionMode: RawItemExecutionMode,
): number {
  const stepStates = Array.isArray(execution.step_states) ? execution.step_states : [];
  if (executionMode === 'sequential') {
    return stepStates.filter((s: any) =>
      s?.status === 'completed'
      || s?.status === 'failed'
      || s?.status === 'cancelled'
      || s?.status === 'timeout'
    ).length;
  }
  return stepStates.filter((s: any) => s?.status === 'submitted').length;
}

export function isTerminalExecutionStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function resolveRawItemExecutionModeFromPolicy(
  executionPolicy: ExecuteEphemeralFanoutRequest['execution_policy'] | undefined,
): RawItemExecutionMode {
  return executionPolicy?.dispatch_mode === 'sequential' ? 'sequential' : 'fanout';
}
