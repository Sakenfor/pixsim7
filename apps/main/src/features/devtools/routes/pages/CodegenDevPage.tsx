import {
  Badge,
  EmptyState,
  SectionHeader,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { canRunCodegen } from '@lib/auth';
import { Icon } from '@lib/icons';

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
  if (typeof window === 'undefined') return '';
  return (new URLSearchParams(window.location.search).get('task') ?? '').trim();
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
// Codegen Task Detail
// ---------------------------------------------------------------------------

function CodegenTaskDetail({ task }: { task: CodegenTask }) {
  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [output, setOutput] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const runTask = useCallback(
    async (check: boolean) => {
      setRunState('loading');
      setRunError('');
      setOutput('');
      try {
        const response = await runCodegenTask({ task_id: task.id, check });
        setOutput(formatOutput(response));
        setRunState(response.ok ? 'idle' : 'error');
      } catch (error) {
        setRunError(extractErrorMessage(error) || 'Failed to run codegen task');
        setRunState('error');
      }
    },
    [task.id],
  );

  const copyCommand = useCallback(
    async (check: boolean) => {
      try {
        await navigator.clipboard.writeText(buildCommand(task.id, check));
        setCopyStatus(check ? 'Check command copied' : 'Run command copied');
      } catch {
        setCopyStatus('Clipboard is unavailable in this browser context');
      }
    },
    [task.id],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-lg font-semibold">{task.id}</div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          {task.description}
        </div>
        <div className="text-xs text-neutral-500">
          Script: <code>{task.script}</code>
        </div>
        {task.groups.length > 0 && (
          <div className="flex gap-1 pt-1">
            {task.groups.map((g) => (
              <Badge key={g} color="gray" className="text-[10px]">{g}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void runTask(false)}
          disabled={runState === 'loading'}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          Run
        </button>
        <button
          onClick={() => void runTask(true)}
          disabled={runState === 'loading' || !task.supports_check}
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
          disabled={runState === 'loading' || !task.supports_check}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Migration Scope Detail
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

function MigrationScopeDetail({
  detail,
  allDetails,
}: {
  detail: MigrationScopeDetail | null;
  allDetails: MigrationScopeDetail[];
}) {
  const [heads, setHeads] = useState<Record<string, MigrationHeadResponse>>({});
  const [headLoadingScopes, setHeadLoadingScopes] = useState<Set<string>>(new Set());
  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [output, setOutput] = useState('');
  const [runningScope, setRunningScope] = useState<string | null>(null);

  const busy = runState === 'loading';

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

  // "all" overview — show all scopes
  if (!detail) {
    return (
      <div className="p-4 space-y-4">
        <SectionHeader
          trailing={
            <div className="flex gap-2">
              <button
                onClick={() => void Promise.all(allDetails.map((d) => checkHead(d.scope)))}
                disabled={busy}
                className="px-2.5 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium rounded transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
              >
                Check All Heads
              </button>
              <button
                onClick={() => void handleRunMigration('all')}
                disabled={busy}
                className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded transition-colors"
              >
                {runningScope === 'all' ? 'Running...' : 'Migrate All'}
              </button>
            </div>
          }
        >
          All Scopes
        </SectionHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {allDetails.map((d) => (
            <ScopeCard
              key={d.scope}
              detail={d}
              head={heads[d.scope] ?? null}
              headLoading={headLoadingScopes.has(d.scope)}
              busy={busy}
              onCheckHead={() => void checkHead(d.scope)}
              onRun={() => void handleRunMigration(d.scope as MigrationScope)}
            />
          ))}
        </div>

        {runError && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
            {runError}
          </div>
        )}

        {output && (
          <OutputPanel output={output} onDismiss={() => { setOutput(''); setRunError(''); setRunState('idle'); }} />
        )}
      </div>
    );
  }

  // Single scope detail
  const head = heads[detail.scope] ?? null;
  return (
    <div className="p-4 space-y-4">
      <ScopeCard
        detail={detail}
        head={head}
        headLoading={headLoadingScopes.has(detail.scope)}
        busy={busy}
        onCheckHead={() => void checkHead(detail.scope)}
        onRun={() => void handleRunMigration(detail.scope as MigrationScope)}
      />

      {runError && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {runError}
        </div>
      )}

      {output && (
        <OutputPanel output={output} onDismiss={() => { setOutput(''); setRunError(''); setRunState('idle'); }} />
      )}
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
        <Badge color="gray" className="text-[10px]">
          {detail.migration_count} migration{detail.migration_count !== 1 ? 's' : ''}
        </Badge>
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
                    <Badge color="green" className="ml-1.5 text-[10px]">up to date</Badge>
                  )}
                  {!head.is_head && head.current_head && (
                    <Badge color="orange" className="ml-1.5 text-[10px]">behind</Badge>
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

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function CodegenDevPage() {
  const user = useAuthStore((s) => s.user);
  const canAccessCodegen = canRunCodegen(user);
  const { theme: variant } = useTheme();

  const requestedTaskId = useMemo(getRequestedTaskIdFromQuery, []);

  // Codegen tasks from API
  const [tasks, setTasks] = useState<CodegenTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');

  // Migration status from API
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatusResponse | null>(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState('');

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError('');
    try {
      const response = await listCodegenTasks();
      setTasks(response.tasks);
    } catch (error) {
      setTasksError(extractErrorMessage(error) || 'Failed to load codegen tasks');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadMigrations = useCallback(async () => {
    setMigrationLoading(true);
    setMigrationError('');
    try {
      const response = await getMigrationStatus();
      setMigrationStatus(response);
    } catch (error) {
      setMigrationError(extractErrorMessage(error) || 'Failed to load migration status');
    } finally {
      setMigrationLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    void loadMigrations();
  }, [loadTasks, loadMigrations]);

  // Build sidebar sections
  const sections = useMemo<SidebarContentLayoutSection[]>(() => {
    const result: SidebarContentLayoutSection[] = [];

    // Codegen tasks section
    const codegenChildren = tasks.map((task) => ({
      id: `task:${task.id}`,
      label: task.id,
      icon: <Icon name={task.supports_check ? 'checkCircle' : 'play'} size={12} />,
    }));
    result.push({
      id: 'codegen',
      label: `Code Generation (${tasks.length})`,
      icon: <Icon name="code" size={13} />,
      children: codegenChildren.length > 0 ? codegenChildren : undefined,
    });

    // Migrations section
    const scopeDetails = migrationStatus?.scope_details ?? [];
    const migrationChildren = [
      { id: 'migration:all', label: 'All Scopes', icon: <Icon name="layers" size={12} /> },
      ...scopeDetails.map((d) => ({
        id: `migration:${d.scope}`,
        label: d.scope,
        icon: <Icon name="database" size={12} />,
      })),
    ];
    result.push({
      id: 'migrations',
      label: `Migrations (${scopeDetails.length})`,
      icon: <Icon name="database" size={13} />,
      children: migrationChildren,
    });

    return result;
  }, [tasks, migrationStatus]);

  const nav = useSidebarNav({
    sections,
    initial: requestedTaskId ? `task:${requestedTaskId}` : undefined,
    storageKey: 'codegen-dev:nav',
  });

  if (!canAccessCodegen) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          message="Permission required"
          description="The devtools.codegen permission is required to access developer tasks."
          icon={<Icon name="lock" size={24} />}
        />
      </div>
    );
  }

  // Resolve active content
  const activeId = nav.activeId;
  let content: React.ReactNode;

  if (activeId.startsWith('task:')) {
    const taskId = activeId.slice(5);
    const task = tasks.find((t) => t.id === taskId);
    content = task ? (
      <CodegenTaskDetail key={task.id} task={task} />
    ) : (
      <div className="p-4">
        <EmptyState message={tasksLoading ? 'Loading tasks...' : 'Task not found'} />
      </div>
    );
  } else if (activeId.startsWith('migration:')) {
    const scopeId = activeId.slice(10);
    const scopeDetails = migrationStatus?.scope_details ?? [];
    const detail = scopeId === 'all' ? null : scopeDetails.find((d) => d.scope === scopeId) ?? null;
    content = migrationLoading ? (
      <div className="p-4">
        <EmptyState message="Loading migration status..." />
      </div>
    ) : (
      <MigrationScopeDetail detail={detail} allDetails={scopeDetails} />
    );
  } else if (activeId === 'codegen') {
    // Section header selected, no child — show overview
    content = tasksLoading ? (
      <div className="p-4">
        <EmptyState message="Loading tasks..." />
      </div>
    ) : tasksError ? (
      <div className="p-4">
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {tasksError}
        </div>
      </div>
    ) : (
      <div className="p-4">
        <EmptyState message="Select a codegen task from the sidebar" />
      </div>
    );
  } else if (activeId === 'migrations') {
    content = migrationLoading ? (
      <div className="p-4">
        <EmptyState message="Loading migration status..." />
      </div>
    ) : migrationError ? (
      <div className="p-4">
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-200">
          {migrationError}
        </div>
      </div>
    ) : (
      <div className="p-4">
        <EmptyState message="Select a migration scope from the sidebar" />
      </div>
    );
  } else {
    content = (
      <div className="p-4">
        <EmptyState message="Select an item from the sidebar" />
      </div>
    );
  }

  return (
    <SidebarContentLayout
      sections={sections}
      activeSectionId={nav.activeSectionId}
      activeChildId={nav.activeChildId}
      onSelectSection={nav.selectSection}
      onSelectChild={nav.selectChild}
      expandedSectionIds={nav.expandedSectionIds}
      onToggleExpand={nav.toggleExpand}
      sidebarWidth="w-48"
      variant={variant}
      collapsible
      expandedWidth={192}
      persistKey="codegen-dev-sidebar"
      contentClassName="overflow-y-auto"
    >
      {content}
    </SidebarContentLayout>
  );
}
