/**
 * /dev/testing/diagnostics — admin-only diagnostic test runner.
 *
 * Pick a diagnostic, fill its params, run it, watch events stream in.
 * Events are emitted by backend diagnostics (see services/diagnostics/);
 * the UI mirrors what tests/manual_test_early_cdn.py shows in --pretty mode.
 *
 * Sister page to /dev/testing (the read-only pytest catalog).  Hidden
 * module under /dev/* like the rest of the developer tools.  Page itself
 * rejects non-admin viewers.
 *
 * Layout: ``DiagnosticsView`` is the body (containerless); this file
 * exports both that and ``DiagnosticsPage`` (full-screen route wrapper).
 * The dockable workspace panel reuses ``DiagnosticsView`` inside its own
 * panel-sized container — so route + panel share one source of truth.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { isAdminUser } from '@lib/auth';

import { useAuthStore } from '@/stores/authStore';

import { DiagnosticRunner } from '../components/DiagnosticRunner';
import {
  cancelDiagnosticRun,
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
}: {
  spec: DiagnosticSpec['params'][number];
  value: unknown;
  onChange: (v: unknown) => void;
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
          <option value="">—</option>
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
 * Containerless body of the diagnostics surface — admin gate, picker,
 * params form, runner, and recent runs.  Designed to be mounted inside
 * either a full-screen route wrapper (``DiagnosticsPage``) or a
 * panel-sized container (the dockable workspace panel).
 */
export function DiagnosticsView() {
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = isAdminUser(currentUser);

  // Honor ``?id=<diagnostic_id>`` deep-links — used by the cross-link from
  // Settings → Library → Maintenance → Signal Scan to land here with the
  // matching diagnostic pre-selected.  The picker still lets the user
  // change selection; we don't write back to the URL on selection change
  // (v1 — keep deep-link semantics one-way).
  const [searchParams] = useSearchParams();
  const initialDiagnosticId = searchParams.get('id');

  const [diagnostics, setDiagnostics] = useState<DiagnosticSpec[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialDiagnosticId);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [recentRuns, setRecentRuns] = useState<DiagnosticRunSummary[]>([]);
  const [currentRun, setCurrentRun] = useState<DiagnosticRunSummary | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedDiagnostic = useMemo(
    () => diagnostics?.find((d) => d.id === selectedId) ?? null,
    [diagnostics, selectedId],
  );

  const { events, connection, error: streamError } = useDiagnosticStream(currentRun?.run_id ?? null);

  // Update local run status when terminal event arrives.
  useEffect(() => {
    if (!currentRun) return;
    const terminal = events.find((e) => e.type === 'terminal');
    if (terminal && terminal.status && currentRun.status === 'running') {
      setCurrentRun({ ...currentRun, status: terminal.status, finished_at: new Date().toISOString() });
      // Refresh recent runs so the history shows the freshly-finished run.
      void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
    }
  }, [events, currentRun]);

  // Initial load
  useEffect(() => {
    if (!isAdmin) return;
    void listDiagnostics().then(setDiagnostics).catch((e) => setSubmitError(String(e)));
    void listDiagnosticRuns().then(setRecentRuns).catch(() => {});
  }, [isAdmin]);

  // Reset params when diagnostic changes.
  useEffect(() => {
    setParams(defaultParamsFor(selectedDiagnostic));
  }, [selectedDiagnostic]);

  const handleRun = useCallback(async () => {
    if (!selectedDiagnostic) return;
    setSubmitting(true);
    setSubmitError(null);
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
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-neutral-950 p-6 text-neutral-100">
      <header>
        <h1 className="text-lg font-semibold text-neutral-100">Testing · Diagnostics</h1>
        <p className="text-xs text-neutral-400">
          Run admin-only diagnostic tests — same code as the CLI scripts in <code className="text-neutral-300">tests/manual_test_*.py</code>,
          visualised live in the browser. Sister to{' '}
          <a href="/dev/testing" className="text-cyan-400 underline-offset-2 hover:underline">
            /dev/testing
          </a>{' '}
          (the pytest catalog).
        </p>
      </header>

      {/* Diagnostic picker */}
      <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">Diagnostic</div>
        {diagnostics === null ? (
          <div className="text-xs text-neutral-500">Loading…</div>
        ) : diagnostics.length === 0 ? (
          <div className="text-xs text-neutral-500">
            No diagnostics registered yet. Add one in{' '}
            <code>pixsim7/backend/main/services/diagnostics/registrations.py</code>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {diagnostics.map((d) => {
              const active = d.id === selectedId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={`rounded border p-2 text-left text-xs transition ${
                    active
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                  }`}
                >
                  <div className="font-semibold text-neutral-100">{d.label}</div>
                  <div className="mt-0.5 text-neutral-400">{d.description}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-neutral-600">
                    id: <span className="font-mono text-neutral-500">{d.id}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Params + Run */}
      {selectedDiagnostic && (
        <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
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
                  onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))}
                />
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleRun}
              disabled={submitting || currentRun?.status === 'running'}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {submitting ? 'Starting…' : 'Run diagnostic'}
            </button>
            {submitError && <span className="text-xs text-red-400">{submitError}</span>}
          </div>
        </section>
      )}

      {/* Active run */}
      {currentRun && selectedDiagnostic && (
        <section>
          <DiagnosticRunner
            diagnostic={selectedDiagnostic}
            run={currentRun}
            events={events}
            connection={connection}
            error={streamError}
            onCancel={handleCancel}
          />
        </section>
      )}

      {/* Recent runs */}
      <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">Recent runs</div>
        {recentRuns.length === 0 ? (
          <div className="text-xs text-neutral-500">No runs yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Diagnostic</th>
                <th className="px-2 py-1 text-left font-medium">Run id</th>
                <th className="px-2 py-1 text-left font-medium">Status</th>
                <th className="px-2 py-1 text-left font-medium">Started</th>
                <th className="px-2 py-1 text-right font-medium">Events</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.run_id} className="border-t border-neutral-800">
                  <td className="px-2 py-1 font-mono text-neutral-200">{r.diagnostic_id}</td>
                  <td className="px-2 py-1 font-mono text-neutral-400">{r.run_id.slice(0, 8)}</td>
                  <td className="px-2 py-1 text-neutral-300">{r.status}</td>
                  <td className="px-2 py-1 text-neutral-500">
                    {new Date(r.started_at).toLocaleTimeString()}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-neutral-300">{r.event_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/**
 * Full-screen route wrapper for ``DiagnosticsView`` — mounted at
 * /dev/testing/diagnostics.  ``h-screen`` is owned here so the view itself
 * can be ``h-full`` and reused inside any parent-sized container.
 */
export function DiagnosticsPage() {
  return (
    <div className="h-screen">
      <DiagnosticsView />
    </div>
  );
}
