/**
 * /dev/testing/diagnostics - admin-only diagnostic test runner.
 *
 * Pick a diagnostic, fill its params, run it, watch events stream in.
 * Events are emitted by backend diagnostics (see services/diagnostics/);
 * the UI mirrors what tests/manual_test_early_cdn.py shows in --pretty mode.
 *
 * Sister page to /dev/testing (the read-only pytest catalog). Hidden
 * module under /dev/* like the rest of the developer tools. Page itself
 * rejects non-admin viewers.
 *
 * Layout: `DiagnosticsView` is the body (containerless); this file
 * exports both that and `DiagnosticsPage` (full-screen route wrapper).
 * The dockable workspace panel reuses `DiagnosticsView` inside its own
 * panel-sized container, so route + panel share one source of truth.
 */
import { SidebarContentLayout, type SidebarContentLayoutSection, useTheme } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { isAdminUser } from '@lib/auth';

import { ProviderAccountSelect, useProviderAccounts } from '@features/providers';
import type { ProviderAccount } from '@features/providers';

import { useAuthStore } from '@/stores/authStore';

import { DiagnosticRunner } from '../components/DiagnosticRunner';
import {
  cancelDiagnosticRun,
  getDiagnosticRun,
  type DiagnosticEvent,
  listDiagnostics,
  listDiagnosticRuns,
  startDiagnosticRun,
  type DiagnosticRunSummary,
  type DiagnosticSpec,
} from '../diagnosticsApi';
import { useDiagnosticStream } from '../useDiagnosticStream';

function defaultParamsFor(spec: DiagnosticSpec | null): Record<string, unknown> {
  if (!spec) return {};
  const out: Record<string, unknown> = {};
  for (const p of spec.params) {
    if (p.default !== null && p.default !== undefined) out[p.name] = p.default;
  }
  return out;
}

function ParamField({
  spec,
  value,
  onChange,
  providerAccounts,
  providerAccountsLoading,
}: {
  spec: DiagnosticSpec['params'][number];
  value: unknown;
  onChange: (v: unknown) => void;
  providerAccounts: ProviderAccount[];
  providerAccountsLoading: boolean;
}) {
  const id = `diagnostic-param-${spec.name}`;
  const label = (
    <label htmlFor={id} className="block text-xs font-medium text-neutral-300">
      {spec.label}
      {spec.required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
  const description = spec.description ? (
    <p className="mt-0.5 text-[10px] text-neutral-500">{spec.description}</p>
  ) : null;

  const baseInput =
    'w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 focus:border-cyan-500 focus:outline-none';

  const isAccountParam = spec.kind === 'string' && spec.name === 'account';
  if (isAccountParam) {
    const rawValue = value === null || value === undefined ? '' : String(value);
    const accountMatch = rawValue.match(/^account:(\d+)$/);
    const selectedAccountId = accountMatch ? Number(accountMatch[1]) : null;
    return (
      <div className="space-y-1.5">
        {label}
        <ProviderAccountSelect
          accounts={providerAccounts}
          value={selectedAccountId}
          onChange={(accountId) => onChange(accountId == null ? '' : `account:${accountId}`)}
          loading={providerAccountsLoading}
          className={baseInput}
          emptyLabel="Select account..."
          noAccountsLabel="No accounts available"
          allowEmpty
          showProviderId
          showStatus
        />
        <input
          id={id}
          type="text"
          value={rawValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="account:<id> or email:password"
          className={baseInput}
        />
        {description}
      </div>
    );
  }

  if (spec.kind === 'bool') {
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-3 w-3"
          />
          <label htmlFor={id} className="text-xs text-neutral-300">{spec.label}</label>
        </div>
        {description}
      </div>
    );
  }

  if (spec.kind === 'select') {
    return (
      <div>
        {label}
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">-</option>
          {spec.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {description}
      </div>
    );
  }

  const inputType = spec.kind === 'int' || spec.kind === 'float' ? 'number' : 'text';
  return (
    <div>
      {label}
      <input
        id={id}
        type={inputType}
        step={spec.kind === 'float' ? 'any' : '1'}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (spec.kind === 'int') onChange(raw === '' ? null : Number.parseInt(raw, 10));
          else if (spec.kind === 'float') onChange(raw === '' ? null : Number.parseFloat(raw));
          else onChange(raw);
        }}
        className={baseInput}
      />
      {description}
    </div>
  );
}

/**
 * Containerless body of the diagnostics surface - admin gate, sidebar picker,
 * params form, runner, and recent runs. Designed to be mounted inside
 * either a full-screen route wrapper (`DiagnosticsPage`) or a
 * panel-sized container (the dockable workspace panel).
 */
export function DiagnosticsView() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(currentUser);
  const { theme: variant } = useTheme();

  // Honor `?id=<diagnostic_id>` deep-links.
  const [searchParams] = useSearchParams();
  const initialDiagnosticId = searchParams.get('id');

  const [diagnostics, setDiagnostics] = useState<DiagnosticSpec[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialDiagnosticId);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [paramsByDiagnosticId, setParamsByDiagnosticId] = useState<Record<string, Record<string, unknown>>>({});
  const [recentRuns, setRecentRuns] = useState<DiagnosticRunSummary[]>([]);
  const [currentRun, setCurrentRun] = useState<DiagnosticRunSummary | null>(null);
  const [prefetchedRunEvents, setPrefetchedRunEvents] = useState<DiagnosticEvent[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { accounts: providerAccounts, loading: providerAccountsLoading } = useProviderAccounts();

  const selectedDiagnostic = useMemo(
    () => diagnostics?.find((d) => d.id === selectedId) ?? null,
    [diagnostics, selectedId],
  );

  const diagnosticSections = useMemo<SidebarContentLayoutSection[]>(
    () => (diagnostics ?? []).map((d) => ({ id: d.id, label: d.label })),
    [diagnostics],
  );

  const { events: streamEvents, connection, error: streamError } = useDiagnosticStream(currentRun?.run_id ?? null);
  const events = useMemo(
    () => (streamEvents.length > 0 ? streamEvents : prefetchedRunEvents),
    [streamEvents, prefetchedRunEvents],
  );
  const diagnosticErrors = useMemo(
    () => events.filter((e) => e.type === 'error').map((e) => String(e.message ?? 'Diagnostic error')),
    [events],
  );
  const missingRequiredFields = useMemo(() => {
    if (!selectedDiagnostic) return [];
    return selectedDiagnostic.params
      .filter((p) => p.required)
      .filter((p) => {
        const value = params[p.name];
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        return false;
      })
      .map((p) => p.label || p.name);
  }, [selectedDiagnostic, params]);
  const recentRunsForSelectedDiagnostic = useMemo(() => {
    if (!selectedId) return recentRuns;
    return recentRuns.filter((run) => run.diagnostic_id === selectedId);
  }, [recentRuns, selectedId]);

  // Update local run status when terminal event arrives.
  useEffect(() => {
    if (!currentRun) return;
    const terminal = events.find((e) => e.type === 'terminal');
    if (terminal && terminal.status && currentRun.status === 'running') {
      setCurrentRun({ ...currentRun, status: terminal.status, finished_at: new Date().toISOString() });
      void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
    }
  }, [events, currentRun]);

  // Fallback: if websocket stream misses terminal, poll run status until finished.
  useEffect(() => {
    if (!currentRun || currentRun.status !== 'running') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await getDiagnosticRun(currentRun.run_id);
        if (cancelled) return;
        if (latest.status !== 'running') {
          setCurrentRun((prev) => (prev && prev.run_id === latest.run_id ? latest : prev));
          void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
        }
      } catch {
        // no-op: stream path remains the primary channel
      }
    };

    const intervalId = window.setInterval(() => {
      void tick();
    }, 3000);
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentRun]);

  // Initial load.
  useEffect(() => {
    if (!isAdmin) return;
    void listDiagnostics().then(setDiagnostics).catch((e) => setSubmitError(String(e)));
    void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
  }, [isAdmin]);

  // Poll the recent-runs list so runs started elsewhere (another device or
  // tab) appear without a manual reload. Runs live in the backend process's
  // memory and aren't persisted, so this list is the only cross-client view.
  useEffect(() => {
    if (!isAdmin) return;
    const intervalId = window.setInterval(() => {
      void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [isAdmin]);

  // Keep selection valid as diagnostics arrive or change.
  useEffect(() => {
    if (diagnostics === null) return;
    if (diagnostics.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && diagnostics.some((d) => d.id === selectedId)) return;
    if (initialDiagnosticId && diagnostics.some((d) => d.id === initialDiagnosticId)) {
      setSelectedId(initialDiagnosticId);
      return;
    }
    setSelectedId(diagnostics[0].id);
  }, [diagnostics, selectedId, initialDiagnosticId]);

  // Reset params when diagnostic changes.
  useEffect(() => {
    if (!selectedDiagnostic) {
      setParams({});
      return;
    }
    const draft = paramsByDiagnosticId[selectedDiagnostic.id];
    setParams(draft ?? defaultParamsFor(selectedDiagnostic));
  }, [selectedDiagnostic, paramsByDiagnosticId]);

  const handleParamChange = useCallback((paramName: string, value: unknown) => {
    if (!selectedDiagnostic) return;
    setParams((prev) => {
      const next = { ...prev, [paramName]: value };
      setParamsByDiagnosticId((drafts) => ({
        ...drafts,
        [selectedDiagnostic.id]: next,
      }));
      return next;
    });
  }, [selectedDiagnostic]);

  const handleRun = useCallback(async () => {
    if (!selectedDiagnostic) return;
    setSubmitting(true);
    setSubmitError(null);
    setPrefetchedRunEvents([]);
    try {
      const res = await startDiagnosticRun(selectedDiagnostic.id, params);
      setCurrentRun({
        run_id: res.run_id,
        diagnostic_id: res.diagnostic_id,
        status: 'running',
        started_at: res.started_at,
        finished_at: null,
        started_by: 'me',
        error: null,
        event_count: 0,
        params,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [selectedDiagnostic, params]);

  const handleCancel = useCallback(async () => {
    if (!currentRun) return;
    try {
      await cancelDiagnosticRun(currentRun.run_id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }, [currentRun]);

  const handleOpenRun = useCallback(async (runId: string) => {
    setSubmitError(null);
    try {
      const detail = await getDiagnosticRun(runId);
      setPrefetchedRunEvents(detail.events ?? []);
      setCurrentRun(detail);
      setSelectedId(detail.diagnostic_id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 p-6 text-neutral-300">
        <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          Diagnostics are admin-only. Sign in with an admin account to access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-neutral-950 text-neutral-100">
      <SidebarContentLayout
        sections={diagnosticSections}
        activeSectionId={selectedId ?? ''}
        onSelectSection={(id) => setSelectedId(id)}
        sidebarTitle={<span className="truncate text-sm">Diagnostics</span>}
        sidebarWidth="w-56"
        variant={variant}
        collapsible
        expandedWidth={224}
        persistKey="testing-diagnostics-sidebar"
        className="h-full bg-neutral-950 text-neutral-100"
        contentClassName="overflow-y-auto"
      >
        <div className="space-y-4 p-6">
          <header>
            <h1 className="text-lg font-semibold text-neutral-100">Testing - Diagnostics</h1>
            <p className="text-xs text-neutral-400">
              Run admin-only diagnostic tests - same code as the CLI scripts in <code className="text-neutral-300">tests/manual_test_*.py</code>,
              visualized live in the browser. Sister to{' '}
              <a href="/dev/testing" className="text-cyan-400 underline-offset-2 hover:underline">
                /dev/testing
              </a>{' '}
              (the pytest catalog).
            </p>
          </header>

          {diagnostics === null && (
            <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-xs text-neutral-500">Loading diagnostics...</div>
            </section>
          )}

          {diagnostics !== null && diagnostics.length === 0 && (
            <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="text-xs text-neutral-500">
                No diagnostics registered yet. Add one in{' '}
                <code>pixsim7/backend/main/services/diagnostics/registrations.py</code>.
              </div>
            </section>
          )}

          {selectedDiagnostic && (
            <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
                {selectedDiagnostic.label}
              </div>
              <div className="mb-3 text-xs text-neutral-400">{selectedDiagnostic.description}</div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">Parameters</div>
              {selectedDiagnostic.params.length === 0 ? (
                <div className="text-xs text-neutral-500">No parameters.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {selectedDiagnostic.params.map((p) => (
                    <ParamField
                      key={p.name}
                      spec={p}
                      value={params[p.name]}
                      onChange={(v) => handleParamChange(p.name, v)}
                      providerAccounts={providerAccounts}
                      providerAccountsLoading={providerAccountsLoading}
                    />
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={submitting || currentRun?.status === 'running' || missingRequiredFields.length > 0}
                  className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {submitting ? 'Starting...' : 'Run diagnostic'}
                </button>
                {submitError && <span className="text-xs text-red-400">{submitError}</span>}
              </div>
              {missingRequiredFields.length > 0 && (
                <div className="mt-2 text-xs text-amber-300">
                  Fill required fields: {missingRequiredFields.join(', ')}
                </div>
              )}
            </section>
          )}

          {currentRun && selectedDiagnostic && currentRun.diagnostic_id === selectedDiagnostic.id && (
            <section>
              <DiagnosticRunner
                diagnostic={selectedDiagnostic}
                run={currentRun}
                events={events}
                connection={connection}
                error={streamError}
                onCancel={handleCancel}
              />
              {diagnosticErrors.length > 0 && (
                <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <div className="mb-1 text-xs font-semibold text-red-300">Diagnostic errors</div>
                  <ul className="space-y-1 text-xs text-red-200">
                    {diagnosticErrors.slice(-5).map((msg, idx) => (
                      <li key={`${idx}-${msg}`}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">
              Recent runs {selectedDiagnostic ? `for ${selectedDiagnostic.label}` : ''}
            </div>
            {recentRunsForSelectedDiagnostic.length === 0 ? (
              <div className="text-xs text-neutral-500">
                {selectedDiagnostic ? 'No runs yet for this diagnostic.' : 'No runs yet.'}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Diagnostic</th>
                    <th className="px-2 py-1 text-left font-medium">Run id</th>
                    <th className="px-2 py-1 text-left font-medium">Status</th>
                    <th className="px-2 py-1 text-left font-medium">Started</th>
                    <th className="px-2 py-1 text-right font-medium">Events</th>
                    <th className="px-2 py-1 text-right font-medium">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRunsForSelectedDiagnostic.map((r) => (
                    <tr
                      key={r.run_id}
                      className={`border-t border-neutral-800 ${currentRun?.run_id === r.run_id ? 'bg-cyan-500/10' : ''}`}
                    >
                      <td className="px-2 py-1 font-mono text-neutral-200">{r.diagnostic_id}</td>
                      <td className="px-2 py-1 font-mono text-neutral-400">{r.run_id.slice(0, 8)}</td>
                      <td className="px-2 py-1 text-neutral-300">{r.status}</td>
                      <td className="px-2 py-1 text-neutral-500">
                        {new Date(r.started_at).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-neutral-300">{r.event_count}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => { void handleOpenRun(r.run_id); }}
                          className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </SidebarContentLayout>
    </div>
  );
}

/**
 * Full-screen route wrapper for `DiagnosticsView` - mounted at
 * /dev/testing/diagnostics. `h-screen` is owned here so the view itself
 * can be `h-full` and reused inside any parent-sized container.
 */
export function DiagnosticsPage() {
  return (
    <div className="h-screen">
      <DiagnosticsView />
    </div>
  );
}
