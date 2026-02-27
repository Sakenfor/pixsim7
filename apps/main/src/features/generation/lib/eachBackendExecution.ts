import {
  type ChainExecution,
  type ExecuteEphemeralFanoutRequest,
  type FanoutItemRequest,
} from '@lib/api/chains';

import type { CombinationStrategy } from './combinationStrategies';
import { buildBackendEachExecutionPolicy } from './fanoutExecutionPolicy';
import type { FanoutRunOptions } from './fanoutPresets';
import {
  executeTrackedRawItemBackendExecution,
  type RawItemExecutionMode,
} from './rawItemBackendExecution';

type EachExecutionMode = FanoutRunOptions['executionMode'] & RawItemExecutionMode;
type EachOnError = FanoutRunOptions['onError'];

export interface PrepareEachBackendExecutionPayloadArgs {
  providerId: string;
  strategy: CombinationStrategy;
  setId?: string;
  onError: EachOnError;
  executionMode: EachExecutionMode;
  reusePreviousOutputAsInput: boolean;
  items: FanoutItemRequest[];
}

export function prepareEachBackendExecutionPayload(
  args: PrepareEachBackendExecutionPayloadArgs,
): ExecuteEphemeralFanoutRequest {
  const {
    providerId,
    strategy,
    setId,
    onError,
    executionMode,
    reusePreviousOutputAsInput,
    items,
  } = args;

  return {
    provider_id: providerId,
    default_operation: 'text_to_image',
    continue_on_error: onError === 'continue',
    force_new: true,
    execution_policy: buildBackendEachExecutionPolicy({
      onError,
      executionMode,
      reusePreviousOutputAsInput,
    }),
    items,
    name: 'Quick Generate Each',
    execution_metadata: {
      source: 'quickgen_each',
      strategy,
      execution_mode: executionMode,
      reuse_previous_output_as_input: reusePreviousOutputAsInput,
      ...(setId ? { set_id: setId } : {}),
    },
  };
}

export interface ExecuteTrackedEachBackendExecutionArgs {
  request: ExecuteEphemeralFanoutRequest;
  total: number;
  executionMode: EachExecutionMode;
  pollIntervalMs?: number;
  onProgress?: (progress: { queued: number; total: number }, execution: ChainExecution) => void;
}

export interface ExecuteTrackedEachBackendExecutionResult {
  execution: ChainExecution;
  generationIds: number[];
}

export async function executeTrackedEachBackendExecution(
  args: ExecuteTrackedEachBackendExecutionArgs,
): Promise<ExecuteTrackedEachBackendExecutionResult> {
  return executeTrackedRawItemBackendExecution(args);
}
