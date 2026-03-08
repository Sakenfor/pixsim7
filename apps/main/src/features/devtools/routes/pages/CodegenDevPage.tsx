import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';
import { canRunCodegen } from '@lib/auth';

import { useAuthStore } from '@/stores/authStore';

import {
  extractErrorMessage,
  listCodegenTasks,
  runCodegenTask,
  getMigrationStatus,
  getMigrationHead,
  runMigration,
  type CodegenRunResponse,
  type CodegenTask,
  type MigrationRunResponse,
  type MigrationScope,
  type MigrationScopeDetail,
  type MigrationStatusResponse,
  type MigrationHeadResponse,
} from './codegenApi';

type Tab = 'codegen' | 'migrations';
type RunState = 'idle' | 'loading' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatMigrationOutput(response: MigrationRunResponse): string {
  const status = response.ok ? 'OK' : 'FAILED';
  const summary = [
    `Scope: ${response.scope}`,
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

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-amber-500 text-amber-600 dark:text-amber-400'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Output Panel (shared)
// ---------------------------------------------------------------------------

function OutputPanel({ output, onDismiss }: { output: string; onDismiss: () => void }) {
  return (
    <div className="relative">
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 px-2 py-0.5 text-xs bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
      >
        Dismiss
      </button>
      <pre className="p-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs max-h-[26rem] overflow-auto whitespace-pre-wrap">
        {output}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code Generation Section
// ---------------------------------------------------------------------------

function CodegenSection() {
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
  }, [requestedTaskId]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Execute tasks from <code>tools/codegen/manifest.ts</code> through backend devtools APIs.
        </p>
        <button
          onClick={() => void loadTasks()}
          disabled={tasksLoading || runState === 'loading'}
          className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

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
                <OutputPanel
                  output={output}
                  onDismiss={() => {
                    setOutput('');
                    setRunError('');
                    setRunState('idle');
                  }}
                />
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

// ---------------------------------------------------------------------------
// Database Migrations Section
// ---------------------------------------------------------------------------

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wide w-24 shrink-0">
        {label}
      </span>
      <code className="text-xs text-neutral-700 dark:text-neutral-300 break-all">{value}</code>
    </div>
  );
}

function ScopeCard({
  detail,
  head,
  headLoading,
  busy,
  onCheckHead,
  onRun,
}: {
  detail: MigrationScopeDetail;
  head: MigrationHeadResponse | null;
  headLoading: boolean;
  busy: boolean;
  onCheckHead: () => void;
  onRun: () => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
        <div className="font-medium text-sm">{detail.scope}</div>
        <div className="text-[11px] text-neutral-500">
          {detail.migration_count} migration{detail.migration_count !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <ConfigRow label="Config" value={detail.config_file} />
          <ConfigRow label="Scripts" value={detail.script_location} />
          <ConfigRow label="Database" value={detail.database_url} />
          <ConfigRow label="Version tbl" value={detail.version_table} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          {head ? (
            <div className="flex-1 text-xs">
              {head.error ? (
                <span className="text-red-600 dark:text-red-400">{head.error}</span>
              ) : (
                <>
                  <span className="text-neutral-500">Head:</span>{' '}
                  <code className="text-neutral-700 dark:text-neutral-300">{head.current_head ?? '(none)'}</code>
                  {head.is_head && (
                    <span className="ml-1.5 text-green-600 dark:text-green-400 font-medium">(up to date)</span>
                  )}
                  {!head.is_head && head.current_head && (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">(behind)</span>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <button
            onClick={onCheckHead}
            disabled={busy || headLoading}
            className="px-2.5 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium rounded transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            {headLoading ? 'Checking...' : 'Check Head'}
          </button>
          <button
            onClick={onRun}
            disabled={busy}
            className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded transition-colors"
          >
            Migrate
          </button>
        </div>
      </div>
    </div>
  );
}

function MigrationsSection() {
  const [status, setStatus] = useState<MigrationStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');

  const [heads, setHeads] = useState<Record<string, MigrationHeadResponse>>({});
  const [headLoadingScopes, setHeadLoadingScopes] = useState<Set<string>>(new Set());

  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [output, setOutput] = useState('');
  const [runningScope, setRunningScope] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const response = await getMigrationStatus();
      setStatus(response);
    } catch (error) {
      setStatusError(extractErrorMessage(error) || 'Failed to load migration status');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const checkHead = useCallback(async (scope: string) => {
    setHeadLoadingScopes((prev) => new Set(prev).add(scope));
    try {
      const response = await getMigrationHead(scope);
      setHeads((prev) => ({ ...prev, [scope]: response }));
    } catch (error) {
      setHeads((prev) => ({
        ...prev,
        [scope]: { scope, current_head: null, is_head: false, error: extractErrorMessage(error) || 'Failed' },
      }));
    } finally {
      setHeadLoadingScopes((prev) => {
        const next = new Set(prev);
        next.delete(scope);
        return next;
      });
    }
  }, []);

  const checkAllHeads = useCallback(async () => {
    if (!status?.scope_details) return;
    await Promise.all(status.scope_details.map((d) => checkHead(d.scope)));
  }, [status, checkHead]);

  const handleRunMigration = useCallback(async (scope: MigrationScope) => {
    setRunState('loading');
    setRunError('');
    setOutput('');
    setRunningScope(scope);
    try {
      const response = await runMigration({ scope });
      setOutput(formatMigrationOutput(response));
      setRunState(response.ok ? 'idle' : 'error');
    } catch (error) {
      setRunError(extractErrorMessage(error) || 'Failed to run migration');
      setRunState('error');
    } finally {
      setRunningScope(null);
    }
  }, []);

  const busy = runState === 'loading';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Run Alembic database migrations via <code>scripts/migrate_all.py</code>.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => void checkAllHeads()}
            disabled={statusLoading || busy || !status?.scope_details?.length}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            Check All Heads
          </button>
          <button
            onClick={() => void handleRunMigration('all')}
            disabled={busy}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {runningScope === 'all' ? 'Running All...' : 'Migrate All'}
          </button>
          <button
            onClick={() => void loadStatus()}
            disabled={statusLoading || busy}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium rounded-md transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {statusError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {statusError}
        </div>
      )}

      {statusLoading ? (
        <div className="p-3 text-sm text-neutral-500">Loading migration status...</div>
      ) : status && !status.available ? (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md text-sm text-yellow-800 dark:text-yellow-200">
          Migration script not found. Ensure <code>scripts/migrate_all.py</code> exists in the repository root.
        </div>
      ) : status?.scope_details?.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {status.scope_details.map((detail) => (
            <ScopeCard
              key={detail.scope}
              detail={detail}
              head={heads[detail.scope] ?? null}
              headLoading={headLoadingScopes.has(detail.scope)}
              busy={busy}
              onCheckHead={() => void checkHead(detail.scope)}
              onRun={() => void handleRunMigration(detail.scope as MigrationScope)}
            />
          ))}
        </div>
      ) : null}

      {runError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {runError}
        </div>
      )}

      {output && (
        <OutputPanel
          output={output}
          onDismiss={() => {
            setOutput('');
            setRunError('');
            setRunState('idle');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function CodegenDevPage() {
  const user = useAuthStore((s) => s.user);
  const canAccessCodegen = canRunCodegen(user);
  const [activeTab, setActiveTab] = useState<Tab>('codegen');

  if (!canAccessCodegen) {
    return (
      <div className="mx-auto max-w-5xl p-6 space-y-4 min-h-screen">
        <header className="border-b border-neutral-200 dark:border-neutral-800 pb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Icon name="code" size={22} className="text-amber-500" />
            Developer Tasks
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            The <code>devtools.codegen</code> permission is required to access developer tasks.
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6 min-h-screen">
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-0">
        <div className="space-y-2 pb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Icon name="code" size={22} className="text-amber-500" />
            Developer Tasks
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Code generation, database migrations, and other developer tasks.
          </p>
        </div>
        <div className="flex gap-0">
          <TabButton active={activeTab === 'codegen'} onClick={() => setActiveTab('codegen')}>
            Code Generation
          </TabButton>
          <TabButton active={activeTab === 'migrations'} onClick={() => setActiveTab('migrations')}>
            Database Migrations
          </TabButton>
        </div>
      </header>

      {activeTab === 'codegen' && <CodegenSection />}
      {activeTab === 'migrations' && <MigrationsSection />}
    </div>
  );
}
