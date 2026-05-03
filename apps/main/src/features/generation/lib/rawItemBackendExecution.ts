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

export interface TrackRawItemBackendExecutionArgs {
  executionId: string;
  total: number;
  executionMode: RawItemExecutionMode;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (progress: { queued: number; total: number }, execution: ChainExecution) => void;
  onNewGenerationId?: (generationId: number, execution: ChainExecution) => void;
}

export interface TrackRawItemBackendExecutionResult {
  execution: ChainExecution;
  generationIds: number[];
}

export async function trackRawItemBackendExecution(
  args: TrackRawItemBackendExecutionArgs,
): Promise<TrackRawItemBackendExecutionResult> {
  const {
    executionId,
    total,
    executionMode,
    pollIntervalMs = 1000,
    timeoutMs = 60 * 60 * 1000,
    onProgress,
    onNewGenerationId,
  } = args;

  const startedAt = Date.now();
  const seenGenerationIds = new Set<number>();
  let execution: ChainExecution | null = null;

  while (true) {
    const state = await getExecution(executionId);
    execution = state;
    onProgress?.(
      { queued: countRawItemExecutionProgress(state, executionMode), total },
      state,
    );
    if (onNewGenerationId) {
      for (const id of extractGenerationIdsFromExecution(state)) {
        if (!seenGenerationIds.has(id)) {
          seenGenerationIds.add(id);
          onNewGenerationId(id, state);
        }
      }
    }
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

export interface ExecuteTrackedRawItemBackendExecutionArgs {
  request: ExecuteEphemeralFanoutRequest;
  total: number;
  executionMode: RawItemExecutionMode;
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (progress: { queued: number; total: number }, execution: ChainExecution) => void;
}

export type ExecuteTrackedRawItemBackendExecutionResult = TrackRawItemBackendExecutionResult;

export async function executeTrackedRawItemBackendExecution(
  args: ExecuteTrackedRawItemBackendExecutionArgs,
): Promise<ExecuteTrackedRawItemBackendExecutionResult> {
  const started = await executeEphemeralFanout(args.request);
  return trackRawItemBackendExecution({
    executionId: started.execution_id,
    total: args.total,
    executionMode: args.executionMode,
    pollIntervalMs: args.pollIntervalMs,
    timeoutMs: args.timeoutMs,
    onProgress: args.onProgress,
  });
}

export interface DispatchRawItemBackendExecutionResult {
  executionId: string;
}

export async function dispatchRawItemBackendExecution(
  request: ExecuteEphemeralFanoutRequest,
): Promise<DispatchRawItemBackendExecutionResult> {
  const started = await executeEphemeralFanout(request);
  return { executionId: started.execution_id };
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
  _executionMode: RawItemExecutionMode,
): number {
  // Count items whose generation row has been created (dispatched to provider),
  // not items whose generation has finished. This keeps the QuickGen bar moving
  // in sequential mode, where the wait between submissions can be minutes.
  const stepStates = Array.isArray(execution.step_states) ? execution.step_states : [];
  return stepStates.filter((s: any) =>
    s?.status === 'submitted'
    || s?.status === 'generating'
    || s?.status === 'completed'
    || s?.status === 'failed'
    || s?.status === 'cancelled'
    || s?.status === 'timeout'
  ).length;
}

export function isTerminalExecutionStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function resolveRawItemExecutionModeFromPolicy(
  executionPolicy: ExecuteEphemeralFanoutRequest['execution_policy'] | undefined,
): RawItemExecutionMode {
  return executionPolicy?.dispatch_mode === 'sequential' ? 'sequential' : 'fanout';
}
