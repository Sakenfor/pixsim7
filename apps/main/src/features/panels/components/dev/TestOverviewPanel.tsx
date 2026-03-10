import { useMemo, useState } from 'react';

import { canRunCodegen } from '@lib/auth';
import { Icon } from '@lib/icons';

import {
  extractErrorMessage,
  runTestProfile,
  type TestRunResponse,
} from '@features/devtools/services/testExecutionApi';
import {
  clearTestRunSnapshots,
  getTestOverview,
  listTestRunSnapshots,
  recordTestRunSnapshot,
  type TestProfileDefinition,
  type TestSuiteDefinition,
  type TestRunSnapshot,
  type TestRunStatus,
} from '@features/devtools/services/testOverviewService';

import { useAuthStore } from '@/stores/authStore';

import { TestAnalyticsGraphs } from './TestAnalyticsGraphs';




function statusClasses(status: TestRunStatus): string {
  if (status === 'passed') {
    return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300';
  }
  if (status === 'failed') {
    return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300';
  }
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300';
}

function formatRunTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function layerClasses(layer: string): string {
  if (layer === 'backend') {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
  }
  if (layer === 'frontend') {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300';
  }
  return 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
}

function renderSuiteMetaPills(suite: TestSuiteDefinition) {
  const pillClassName =
    'px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300';
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {suite.category && <span className={pillClassName}>{suite.category}</span>}
      {suite.subcategory && <span className={pillClassName}>{suite.subcategory}</span>}
      {suite.kind && <span className={pillClassName}>{suite.kind}</span>}
      {suite.covers && suite.covers.length > 0 && (
        <span className={pillClassName} title={suite.covers.join(', ')}>
          covers {suite.covers.length}
        </span>
      )}
    </div>
  );
}

function formatRunOutput(result: TestRunResponse): string {
  const scope = result.backend_only
    ? 'backend-only'
    : result.frontend_only
      ? 'frontend-only'
      : 'backend+frontend';

  const summary = [
    `Profile: ${result.profile}`,
    `Scope: ${scope}`,
    `Status: ${result.ok ? 'passed' : 'failed'}`,
    result.exit_code !== null ? `Exit code: ${result.exit_code}` : 'Exit code: -',
    `Duration: ${(result.duration_ms / 1000).toFixed(1)}s`,
  ].join('\n');

  const stdout = result.stdout?.trim();
  const stderr = result.stderr?.trim();

  return [
    summary,
    stdout ? `\n--- stdout ---\n${stdout}` : '',
    stderr ? `\n--- stderr ---\n${stderr}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

interface ProfileCardProps {
  profile: TestProfileDefinition;
  onCopy: (profile: TestProfileDefinition) => Promise<void>;
  onRecord: (profileId: TestProfileDefinition['id'], status: TestRunStatus) => void;
  onRun: (profile: TestProfileDefinition) => Promise<void>;
  canExecute: boolean;
  running: boolean;
  copied: boolean;
}

function ProfileCard({
  profile,
  onCopy,
  onRecord,
  onRun,
  canExecute,
  running,
  copied,
}: ProfileCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {profile.label}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {profile.description}
          </p>
        </div>
        <code className="text-[11px] px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
          {profile.command}
        </code>
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {canExecute && (
          <button
            onClick={() => void onRun(profile)}
            disabled={running}
            className="px-2.5 py-1.5 text-xs font-medium rounded bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
          >
            {running ? 'Running...' : 'Run now'}
          </button>
        )}
        <button
          onClick={() => void onCopy(profile)}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
        >
          {copied ? 'Copied' : 'Copy command'}
        </button>
        <button
          onClick={() => onRecord(profile.id, 'passed')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 hover:opacity-90"
        >
          Mark passed
        </button>
        <button
          onClick={() => onRecord(profile.id, 'failed')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 hover:opacity-90"
        >
          Mark failed
        </button>
        <button
          onClick={() => onRecord(profile.id, 'skipped')}
          className="px-2.5 py-1.5 text-xs font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:opacity-90"
        >
          Mark skipped
        </button>
      </div>
    </div>
  );
}

export function TestOverviewPanel() {
  const overview = useMemo(() => getTestOverview(), []);
  const user = useAuthStore((state) => state.user);
  const canExecute = canRunCodegen(user);
  const [runs, setRuns] = useState<TestRunSnapshot[]>(() => listTestRunSnapshots(60));
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [runningProfileId, setRunningProfileId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string>('');
  const [runOutput, setRunOutput] = useState<string>('');

  const lastRun = runs[0] ?? null;

  const handleCopyCommand = async (profile: TestProfileDefinition) => {
    try {
      await navigator.clipboard.writeText(profile.command);
      setCopiedCommand(profile.id);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === profile.id ? null : current));
      }, 1300);
    } catch {
      // Clipboard may be unavailable in restrictive browser contexts.
      setCopiedCommand(null);
    }
  };

  const handleRecordRun = (profileId: TestProfileDefinition['id'], status: TestRunStatus) => {
    recordTestRunSnapshot(profileId, status);
    setRuns(listTestRunSnapshots(60));
  };

  const handleRunProfile = async (profile: TestProfileDefinition) => {
    setRunningProfileId(profile.id);
    setRunError('');
    setRunOutput('');
    try {
      const result = await runTestProfile(profile.runRequest);
      setRunOutput(formatRunOutput(result));
      handleRecordRun(profile.id, result.ok ? 'passed' : 'failed');
    } catch (error) {
      setRunError(extractErrorMessage(error) || 'Failed to run test profile');
      handleRecordRun(profile.id, 'failed');
    } finally {
      setRunningProfileId(null);
    }
  };

  const handleClearHistory = () => {
    clearTestRunSnapshots();
    setRuns([]);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Icon name="flask" size={18} className="text-emerald-500" />
          <h2 className="text-lg font-semibold">Test Overview</h2>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          User-facing test profile overview aligned with the unified runner.
        </p>
        {!canExecute && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            Read-only mode. The <code>devtools.codegen</code> permission is required to execute profiles.
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Profiles</div>
            <div className="text-2xl font-semibold mt-1">{overview.profiles.length}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Tracked suites</div>
            <div className="text-2xl font-semibold mt-1">{overview.suites.length}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Last run</div>
            {lastRun ? (
              <div className="mt-1 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses(lastRun.status)}`}>
                  {lastRun.status}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{lastRun.profileLabel}</span>
              </div>
            ) : (
              <div className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">No local snapshots</div>
            )}
          </div>
        </section>

        {(runError || runOutput) && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Execution output</h3>
            {runError && (
              <div className="px-3 py-2 text-sm rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                {runError}
              </div>
            )}
            {runOutput && (
              <pre className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-xs overflow-auto whitespace-pre-wrap">
                {runOutput}
              </pre>
            )}
          </section>
        )}

        <TestAnalyticsGraphs snapshots={runs} />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Profiles</h3>
          <div className="space-y-3">
            {overview.profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onCopy={handleCopyCommand}
                onRecord={handleRecordRun}
                onRun={handleRunProfile}
                canExecute={canExecute}
                running={runningProfileId === profile.id}
                copied={copiedCommand === profile.id}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Suites</h3>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
            {overview.suites.map((suite) => (
              <div key={suite.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{suite.label}</div>
                  <code className="text-[11px] text-neutral-500 dark:text-neutral-400">{suite.path}</code>
                  {renderSuiteMetaPills(suite)}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${layerClasses(suite.layer)}`}>
                  {suite.layer}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Local run history</h3>
            <button
              onClick={handleClearHistory}
              disabled={runs.length === 0}
              className="px-2.5 py-1 text-xs font-medium rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          {runs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-4 text-sm text-neutral-500 dark:text-neutral-400">
              No snapshots yet. Use profile buttons to mark latest local run outcomes.
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
              {runs.map((run) => (
                <div key={run.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{run.profileLabel}</div>
                    <code className="text-[11px] text-neutral-500 dark:text-neutral-400">{run.command}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClasses(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {formatRunTime(run.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-1">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Docs</h3>
          <div className="space-y-1.5">
            {overview.docs.map((docPath) => (
              <code
                key={docPath}
                className="block text-[11px] px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300"
              >
                {docPath}
              </code>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
