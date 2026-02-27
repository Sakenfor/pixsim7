import type { ExecutionPolicyV1Input } from '@lib/api/chains';

import type { FanoutRunOptions } from './fanoutPresets';

export function buildBackendEachExecutionPolicy(
  options: Pick<FanoutRunOptions, 'onError' | 'executionMode' | 'reusePreviousOutputAsInput'>,
): ExecutionPolicyV1Input {
  if (options.executionMode === 'sequential') {
    return {
      version: 1,
      dispatch_mode: 'sequential',
      wait_policy: 'terminal_per_step',
      dependency_mode: options.reusePreviousOutputAsInput ? 'previous' : 'none',
      failure_policy: options.onError === 'stop' ? 'stop' : 'continue',
      concurrency: 1,
      force_new: true,
    };
  }

  return buildBackendFanoutExecutionPolicy(options);
}

export function buildBackendFanoutExecutionPolicy(
  options: Pick<FanoutRunOptions, 'onError'>,
): ExecutionPolicyV1Input {
  return {
    version: 1,
    dispatch_mode: 'fanout',
    wait_policy: 'none',
    dependency_mode: 'none',
    failure_policy: options.onError === 'stop' ? 'stop' : 'continue',
    concurrency: 1,
    force_new: true,
  };
}
