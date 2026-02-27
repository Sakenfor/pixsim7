import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  extractErrorMessage,
  listCodegenTasks,
  runCodegenTask,
  type CodegenRunResponse,
  type CodegenTask,
} from '@devtools/mainApp/codegenApi';
import { Icon } from '@devtools/mainApp/lib/icons';
import { canRunCodegen } from '@devtools/mainApp/userRoles';
import { useAuthStore } from '@devtools/mainApp/authStore';

type RunState = 'idle' | 'loading' | 'error';

function buildCommand(taskId: string, check: boolean): string {
  return check
    ? `pnpm codegen -- --only ${taskId} --check`
    : `pnpm codegen -- --only ${taskId}`;
}

function formatOutput(response: CodegenRunResponse): string {
  const status = response.ok ? 'OK' : 'FAILED';
  const summary = [
    `Task: ${response.task_id}`,
    `Status: ${status}`,
    response.exit_code !== null ? `Exit code: ${response.exit_code}` : 'Exit code: -',
    `Duration: ${(response.duration_ms / 1000).toFixed(1)}s`,
  ].join('\n');

  const stdout = response.stdout?.trim();
  const stderr = response.stderr?.trim();

  return [
    summary,
    stdout ? `\n--- stdout ---\n${stdout}` : '',
    stderr ? `\n--- stderr ---\n${stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function getRequestedTaskIdFromQuery(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = new URLSearchParams(window.location.search).get('task') ?? '';
  return raw.trim();
}

export function CodegenDev() {
  const user = useAuthStore((s) => s.user);
  const canAccessCodegen = canRunCodegen(user);
  const requestedTaskId = useMemo(getRequestedTaskIdFromQuery, []);

  const [tasks, setTasks] = useState<CodegenTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [output, setOutput] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const loadTasks = useCallback(async () => {
    if (!canAccessCodegen) {
      return;
    }
    setTasksLoading(true);
    setTasksError('');
    try {
      const response = await listCodegenTasks();
      setTasks(response.tasks);
      setSelectedTaskId((prev) => {
        if (prev && response.tasks.some((task) => task.id === prev)) {
          return prev;
        }
        const requested = requestedTaskId && response.tasks.find((task) => task.id === requestedTaskId)?.id;
        if (requested) {
          return requested;
        }
        return response.tasks.find((task) => task.id === 'app-map')?.id ?? response.tasks[0]?.id ?? '';
      });
    } catch (error) {
      setTasksError(extractErrorMessage(error) || 'Failed to load codegen tasks');
    } finally {
      setTasksLoading(false);
    }
  }, [canAccessCodegen, requestedTaskId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const runSelectedTask = useCallback(
    async (check: boolean) => {
      if (!selectedTaskId) {
        return;
      }
      setRunState('loading');
      setRunError('');
      setOutput('');
      try {
        const response = await runCodegenTask({
          task_id: selectedTaskId,
          check,
        });
        setOutput(formatOutput(response));
        setRunState(response.ok ? 'idle' : 'error');
      } catch (error) {
        setRunError(extractErrorMessage(error) || 'Failed to run codegen task');
        setRunState('error');
      }
    },
    [selectedTaskId],
  );

  const copyCommand = useCallback(
    async (check: boolean) => {
      if (!selectedTaskId) {
        return;
      }
      try {
        await navigator.clipboard.writeText(buildCommand(selectedTaskId, check));
        setCopyStatus(check ? 'Check command copied' : 'Run command copied');
      } catch {
        setCopyStatus('Clipboard is unavailable in this browser context');
      }
    },
    [selectedTaskId],
  );

  if (!canAccessCodegen) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-4 min-h-screen">
        <header className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Icon name="code" size={22} className="text-amber-500" />
            Code Generation
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            The <code>devtools.codegen</code> permission is required to run backend codegen tasks.
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6 min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="code" size={22} className="text-amber-500" />
              Code Generation
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Execute tasks from <code>tools/codegen/manifest.ts</code> through backend devtools APIs.
            </p>
          </div>
          <button
            onClick={() => void loadTasks()}
            disabled={tasksLoading || runState === 'loading'}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      {tasksError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {tasksError}
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[2fr,3fr] gap-4">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-sm font-medium">
            Tasks
          </div>
          <div className="max-h-[26rem] overflow-auto">
            {tasksLoading ? (
              <div className="p-3 text-sm text-neutral-500">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="p-3 text-sm text-neutral-500">No codegen tasks found.</div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full text-left p-3 border-b border-neutral-100 dark:border-neutral-800/70 hover:bg-neutral-50 dark:hover:bg-neutral-900/70 ${
                    task.id === selectedTaskId ? 'bg-amber-50 dark:bg-amber-900/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-sm">{task.id}</div>
                    <div className="text-[11px] text-neutral-500">
                      {task.supports_check ? 'check' : 'run'}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500 line-clamp-2">{task.description}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
          {selectedTask ? (
            <>
              <div className="space-y-1">
                <div className="text-lg font-semibold">{selectedTask.id}</div>
                <div className="text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedTask.description}
                </div>
                <div className="text-xs text-neutral-500">
                  Script: <code>{selectedTask.script}</code>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void runSelectedTask(false)}
                  disabled={runState === 'loading'}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
                >
                  Run
                </button>
                <button
                  onClick={() => void runSelectedTask(true)}
                  disabled={runState === 'loading' || !selectedTask.supports_check}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                >
                  Check
                </button>
                <button
                  onClick={() => void copyCommand(false)}
                  disabled={runState === 'loading'}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                >
                  Copy run cmd
                </button>
                <button
                  onClick={() => void copyCommand(true)}
                  disabled={runState === 'loading' || !selectedTask.supports_check}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
                >
                  Copy check cmd
                </button>
              </div>

              {copyStatus && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{copyStatus}</div>
              )}

              {runError && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
                  {runError}
                </div>
              )}

              {output && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setOutput('');
                      setRunError('');
                      setRunState('idle');
                    }}
                    className="absolute top-2 right-2 px-2 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                  >
                    Dismiss
                  </button>
                  <pre className="p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs max-h-[26rem] overflow-auto whitespace-pre-wrap">
                    {output}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-neutral-500">Select a task to run.</div>
          )}
        </div>
      </section>
    </div>
  );
}

export default CodegenDev;
