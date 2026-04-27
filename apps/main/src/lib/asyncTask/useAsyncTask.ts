import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useAsyncTaskStore, type AsyncTaskStatus } from './asyncTaskStore';

export interface AsyncTaskResult {
  message: string;
  isError: boolean;
}

export type AsyncTaskRunner = () => Promise<string | null | void>;

export interface UseAsyncTaskReturn {
  isRunning: boolean;
  result: AsyncTaskResult | null;
  run: () => Promise<void>;
  clear: () => void;
}

/**
 * Run an async action whose status survives component remount.
 *
 * Runner contract:
 *  - return a string  → success, shown as result message
 *  - return null/void → success quietly (no result message)
 *  - throw            → error, message taken from `err.message`
 *
 * `taskId` should be globally unique across the app — namespace per panel
 * (e.g. `'maintenance:sha'`, `'gallery:bulk-tag'`) to avoid collisions.
 */
export function useAsyncTask(taskId: string, runner: AsyncTaskRunner): UseAsyncTaskReturn {
  const status = useAsyncTaskStore((s) => s.byTask[taskId]?.status);
  const message = useAsyncTaskStore((s) => s.byTask[taskId]?.message);
  const setStatus = useAsyncTaskStore((s) => s.setStatus);
  const clearStore = useAsyncTaskStore((s) => s.clear);

  const runnerRef = useRef(runner);
  useEffect(() => {
    runnerRef.current = runner;
  });

  const isRunning = status === 'running';

  const result = useMemo<AsyncTaskResult | null>(() => {
    if (status === 'success' && message) return { message, isError: false };
    if (status === 'error' && message) return { message, isError: true };
    return null;
  }, [status, message]);

  const run = useCallback(async () => {
    setStatus(taskId, { status: 'running', startedAt: Date.now() });
    try {
      const msg = await runnerRef.current();
      setStatus(taskId, msg ? { status: 'success', message: msg } : { status: 'idle' });
    } catch (err: any) {
      setStatus(taskId, { status: 'error', message: err?.message || 'Action failed' });
    }
  }, [taskId, setStatus]);

  const clear = useCallback(() => clearStore(taskId), [taskId, clearStore]);

  return { isRunning, result, run, clear };
}

/** Read-only subscription to a task's status (for sibling components like sidebar badges). */
export function useAsyncTaskStatus(taskId: string): AsyncTaskStatus {
  return useAsyncTaskStore((s) => s.byTask[taskId]?.status ?? 'idle');
}

export function useIsAsyncTaskRunning(taskId: string): boolean {
  return useAsyncTaskStore((s) => s.byTask[taskId]?.status === 'running');
}

