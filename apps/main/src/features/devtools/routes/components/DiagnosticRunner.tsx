/**
 * DiagnosticRunner — live view of one diagnostic run.
 *
 * Layout mirrors the Rich `--pretty` console output of
 * tests/manual_test_early_cdn.py (the inspiration for this whole feature):
 *   ┌─ Header (diagnostic + run id + status + elapsed) ─┐
 *   ┌─ Phase strip (Init → Submitting → ...)           ─┐
 *   ┌─ Latest Observations (per-source rollup)         ─┐
 *   ┌─ Key Transitions (named milestones)              ─┐
 *   ┌─ Summary (when terminal)                         ─┐
 */
import { useMemo } from 'react';

import type {
  DiagnosticEvent,
  DiagnosticRunSummary,
  DiagnosticSpec,
} from '../diagnosticsApi';
import type { StreamConnectionState } from '../useDiagnosticStream';

interface DiagnosticRunnerProps {
  diagnostic: DiagnosticSpec;
  run: DiagnosticRunSummary | null;
  events: DiagnosticEvent[];
  connection: StreamConnectionState;
  error: string | null;
  onCancel?: () => void;
}

const PHASES: Array<{ key: string; label: string; color: string }> = [
  { key: 'init', label: 'Init', color: 'text-blue-400' },
  { key: 'submitting', label: 'Submitting', color: 'text-cyan-400' },
  { key: 'polling', label: 'Polling', color: 'text-yellow-400' },
  { key: 'post_terminal', label: 'Post-terminal', color: 'text-purple-400' },
  { key: 'done', label: 'Done', color: 'text-emerald-400' },
];

const TRANSITION_ORDER: Array<{ key: string; label: string }> = [
  { key: 't_first_real_get', label: 'get_video → real URL' },
  { key: 't_first_real_list', label: 'list_videos → real URL' },
  { key: 't_placeholder_get', label: 'get_video → placeholder' },
  { key: 't_placeholder_list', label: 'list_videos → placeholder' },
  { key: 't_404', label: 'HEAD → 404' },
  { key: 't_first_thumbnail_get', label: 'first thumb (get)' },
  { key: 't_first_thumbnail_list', label: 'first thumb (list)' },
];

function formatT(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)}s`;
}

function statusPill(status: DiagnosticRunSummary['status'] | undefined): string {
  switch (status) {
    case 'running': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    case 'completed': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'cancelled': return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40';
    case 'errored': return 'bg-red-500/20 text-red-300 border-red-500/40';
    default: return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/40';
  }
}

export function DiagnosticRunner({
  diagnostic,
  run,
  events,
  connection,
  error,
  onCancel,
}: DiagnosticRunnerProps) {
  const { currentPhase, latestPerSource, transitions, summary, terminal } = useMemo(() => {
    let phase = 'init';
    const sources = new Map<string, DiagnosticEvent>();
    const trans = new Map<string, number>();
    let summ: DiagnosticEvent | null = null;
    let term: DiagnosticEvent | null = null;
    for (const ev of events) {
      if (ev.type === 'phase' && typeof ev.phase === 'string') {
        phase = ev.phase;
      } else if (ev.type === 'observation' && typeof ev.source === 'string') {
        sources.set(ev.source, ev);
      } else if (ev.type === 'transition' && typeof ev.key === 'string') {
        trans.set(ev.key, typeof ev.value === 'number' ? ev.value : ev.t_rel);
      } else if (ev.type === 'summary') {
        summ = ev;
      } else if (ev.type === 'terminal') {
        term = ev;
      }
    }
    if (term) phase = 'done';
    return {
      currentPhase: phase,
      latestPerSource: sources,
      transitions: trans,
      summary: summ,
      terminal: term,
    };
  }, [events]);

  const elapsed = events.length > 0 ? events[events.length - 1].t_rel : 0;
  const isRunning = run?.status === 'running' && !terminal;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 rounded border border-cyan-500/40 bg-cyan-500/5 px-3 py-2">
        <div className="font-bold text-cyan-300">{diagnostic.label}</div>
        {run && (
          <>
            <div className="text-xs text-neutral-400">
              run <span className="font-mono text-neutral-300">{run.run_id.slice(0, 8)}</span>
            </div>
            <span className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${statusPill(run.status)}`}>
              {run.status}
            </span>
          </>
        )}
        <div className="ml-auto text-xs text-neutral-400">
          elapsed <span className="font-mono text-neutral-200">{elapsed.toFixed(1)}s</span>
        </div>
        {connection === 'connecting' && <span className="text-xs text-neutral-500">connecting…</span>}
        {connection === 'error' && <span className="text-xs text-red-400">{error ?? 'stream error'}</span>}
        {isRunning && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300 hover:bg-red-500/20"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Phase strip */}
      <div className="rounded border border-neutral-700 bg-neutral-900/40 px-3 py-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Phase</div>
        <div className="flex flex-wrap items-center gap-2">
          {PHASES.map((p, idx) => {
            const isActive = p.key === currentPhase;
            const activeIdx = PHASES.findIndex((x) => x.key === currentPhase);
            const isPast = activeIdx > -1 && idx < activeIdx;
            return (
              <div key={p.key} className="flex items-center gap-2">
                {idx > 0 && <span className="text-neutral-600">→</span>}
                <span
                  className={
                    isActive
                      ? `font-bold ${p.color}`
                      : isPast
                        ? `${p.color} opacity-80`
                        : 'text-neutral-500'
                  }
                >
                  {isActive && p.key !== 'done' && (
                    <span className="mr-1 inline-block animate-pulse">●</span>
                  )}
                  {!isActive && isPast && <span className="mr-1">✓</span>}
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Latest observations */}
      {latestPerSource.size > 0 && (
        <div className="rounded border border-neutral-700 bg-neutral-900/40">
          <div className="border-b border-neutral-700 px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Latest observations
          </div>
          <table className="w-full text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="px-3 py-1 text-left font-medium">Source</th>
                <th className="px-3 py-1 text-left font-medium">Status</th>
                <th className="px-3 py-1 text-left font-medium">URL</th>
                <th className="px-3 py-1 text-left font-medium">Thumb</th>
                <th className="px-3 py-1 text-left font-medium">Dims</th>
                <th className="px-3 py-1 text-right font-medium">t_rel</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(latestPerSource.entries()).map(([source, ev]) => (
                <tr key={source} className="border-t border-neutral-800">
                  <td className="px-3 py-1 font-mono text-cyan-300">{source}</td>
                  <td className="px-3 py-1 font-mono text-neutral-200">{String(ev.raw_status ?? '—')}</td>
                  <td className="px-3 py-1">
                    {ev.url_is_retrievable ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">REAL</span>
                    ) : ev.url_is_placeholder ? (
                      <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-yellow-300">PLH</span>
                    ) : ev.url ? (
                      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-purple-300">other</span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1">
                    {ev.thumbnail_url ? (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">YES</span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1 font-mono text-neutral-300">
                    {(ev.width ?? 0)}×{(ev.height ?? 0)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono text-neutral-400">
                    {ev.t_rel.toFixed(2)}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Key transitions */}
      {transitions.size > 0 && (
        <div className="rounded border border-neutral-700 bg-neutral-900/40">
          <div className="border-b border-neutral-700 px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Key transitions
          </div>
          <table className="w-full text-xs">
            <tbody>
              {TRANSITION_ORDER.filter((t) => transitions.has(t.key)).map((t) => (
                <tr key={t.key} className="border-t border-neutral-800">
                  <td className="px-3 py-1 text-neutral-300">{t.label}</td>
                  <td className="px-3 py-1 text-right font-mono text-emerald-300">
                    {formatT(transitions.get(t.key))}
                  </td>
                </tr>
              ))}
              {/* Show any unknown keys too */}
              {Array.from(transitions.entries())
                .filter(([k]) => !TRANSITION_ORDER.find((t) => t.key === k))
                .map(([k, v]) => (
                  <tr key={k} className="border-t border-neutral-800">
                    <td className="px-3 py-1 text-neutral-400">{k}</td>
                    <td className="px-3 py-1 text-right font-mono text-emerald-300">{formatT(v)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">Summary</div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-neutral-200">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(summary).filter(([k]) => k !== 't_rel' && k !== 'type'),
              ),
              null,
              2,
            )}
          </pre>
        </div>
      )}

      {terminal?.status === 'errored' && run?.error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <div className="font-semibold">Diagnostic errored:</div>
          <div className="font-mono">{run.error}</div>
        </div>
      )}
    </div>
  );
}
