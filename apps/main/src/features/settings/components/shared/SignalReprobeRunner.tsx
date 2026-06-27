import { LoadingSpinner } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  bustStatsCache,
  extractErrorMessage,
  fmt,
  maintGet,
  maintPatch,
  maintPost,
} from './maintenanceShared';

// Mirrors backend SignalBackfillRunResponse (api/v1/assets_maintenance.py).
// Modes mirror service VALID_MODES (signal_backfill_service.py).
type ReprobeMode = 'reprobe' | 'reprobe_local' | 'rescore';

// Short labels for the start-button + dropdown (keeps the raw mode token, e.g.
// "reprobe_local", out of the button copy).
const MODE_LABELS: Record<ReprobeMode, string> = {
  reprobe: 'reprobe',
  reprobe_local: 'local reprobe',
  rescore: 'rescore',
};

interface SignalBackfillRun {
  id: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  target_scanner_version: string;
  mode: ReprobeMode;
  batch_size: number;
  cursor_asset_id: number;
  total_assets: number;
  processed_assets: number;
  scanned_assets: number;
  broken_assets: number;
  skipped_assets: number;
  failed_assets: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface RunListResponse {
  items: SignalBackfillRun[];
  total: number;
}

// Subset of backend MediaSettings (media_settings namespace) that tunes the
// reprobe's CPU footprint. Hand-mirrored (like SignalBackfillRun above) so the
// control doesn't depend on a regenerated api-model. Read fresh by the worker
// each batch — changes apply on the next batch, no restart.
interface ReprobeTuning {
  signal_reprobe_concurrency: number;
  signal_reprobe_ffmpeg_threads: number;
}

const SURFACE = 'settings:signal-reprobe';
const STATS_KEY = '/assets/signal-scan-stats';
// The assets-maintenance router is mounted under /assets — sibling endpoints
// (signal-calibration, signal-scan-stats) use that prefix; these run endpoints
// must too, or they 404.
const RUNS_PATH = '/assets/signal-backfill-runs';
const MEDIA_SETTINGS_PATH = '/media/settings';
const ACTIVE: SignalBackfillRun['status'][] = ['pending', 'running'];
const POLL_MS = 2000;
const DEFAULT_BATCH = 200;
// Bounds mirror the MediaSettings Field(ge=…, le=…) constraints.
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 32;
const THREADS_MIN = 0;
const THREADS_MAX = 16;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// How many recent runs to show in the history strip.
const HISTORY_LIMIT = 5;

// Themed form-control classes. Native <select>/<input> don't inherit the
// shadcn `bg-background` token reliably (they keep the UA white), so mirror the
// shared Input/Select primitives: explicit white / dark-neutral surfaces +
// readable text, and option styling for the dropdown.
const FIELD_CLS =
  'rounded border border-neutral-300 bg-white text-neutral-900 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 disabled:opacity-50';
const SELECT_CLS =
  'rounded border border-neutral-300 bg-white text-neutral-900 ' +
  'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 ' +
  '[&>option]:bg-white [&>option]:text-neutral-900 ' +
  'dark:[&>option]:bg-neutral-800 dark:[&>option]:text-neutral-100 disabled:opacity-50';

/** Short, local date+time for a run's most relevant timestamp. */
function formatRunDate(r: SignalBackfillRun): string {
  const iso = r.completed_at ?? r.started_at ?? r.created_at;
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const isActive = (r: SignalBackfillRun | null): boolean =>
  !!r && ACTIVE.includes(r.status);

const STATUS_CLASS: Record<SignalBackfillRun['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-600',
  running: 'bg-sky-500/15 text-sky-600',
  paused: 'bg-zinc-500/15 text-zinc-500',
  completed: 'bg-emerald-500/15 text-emerald-600',
  failed: 'bg-red-500/15 text-red-600',
  cancelled: 'bg-zinc-500/15 text-zinc-500',
};

/**
 * Drives a durable signal-scan reprobe run (full ffmpeg probe -> chroma fingerprint
 * + audio/visual metrics) from the Video Health row. Unlike the cheap "Scan"
 * (re-scores stored metrics and can't compute the probe-derived fields), this
 * re-probes every stale video, resumable across worker restarts. Self-contained:
 * create -> poll -> pause/resume/cancel.
 */
export function SignalReprobeRunner() {
  const [run, setRun] = useState<SignalBackfillRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tuning, setTuning] = useState<ReprobeTuning | null>(null);
  // Mode for the NEXT run to start (existing runs carry their own mode).
  const [mode, setMode] = useState<ReprobeMode>('reprobe');
  // Recent runs (incl. the live one at index 0) for the history strip.
  const [history, setHistory] = useState<SignalBackfillRun[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refetch the recent-runs list (history strip + latest tracker). Best-effort.
  const refreshHistory = useCallback(async (): Promise<SignalBackfillRun[]> => {
    const r = await maintGet<RunListResponse>(
      `${RUNS_PATH}?limit=${HISTORY_LIMIT}`,
      SURFACE,
    );
    setHistory(r.items);
    return r.items;
  }, []);

  // Initial load: surface the recent runs (resume display if the latest is active).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshHistory()
      .then((items) => {
        if (!cancelled) setRun(items[0] ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(extractErrorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshHistory]);

  // Load the live probe-tuning knobs (media_settings) once.
  useEffect(() => {
    let cancelled = false;
    maintGet<ReprobeTuning>(MEDIA_SETTINGS_PATH, SURFACE)
      .then((s) => {
        if (!cancelled) setTuning(s);
      })
      .catch(() => {
        /* tuning is optional chrome — never block the runner on it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistically apply a tuning change, then persist (worker reads it next batch).
  const commitTuning = useCallback(
    async (key: keyof ReprobeTuning, value: number) => {
      setTuning((t) => (t ? { ...t, [key]: value } : t));
      try {
        const next = await maintPatch<ReprobeTuning>(
          MEDIA_SETTINGS_PATH,
          { [key]: value },
          SURFACE,
        );
        setTuning((t) => ({ ...(t ?? next), [key]: next[key] }));
      } catch (e) {
        setError(extractErrorMessage(e));
      }
    },
    [],
  );

  // Poll while the displayed run is active; bust the coverage cache when it ends.
  useEffect(() => {
    const id = run?.id;
    if (!id || !isActive(run)) return;
    pollRef.current = setInterval(async () => {
      try {
        const fresh = await maintGet<SignalBackfillRun>(
          `${RUNS_PATH}/${id}`,
          SURFACE,
        );
        setRun(fresh);
        if (!isActive(fresh)) {
          bustStatsCache(STATS_KEY);
          void refreshHistory().catch(() => {}); // capture the final counters
        }
      } catch (e) {
        setError(extractErrorMessage(e));
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    async (fn: () => Promise<SignalBackfillRun>) => {
      setBusy(true);
      setError(null);
      try {
        setRun(await fn());
        void refreshHistory().catch(() => {});
      } catch (e) {
        setError(extractErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [refreshHistory],
  );

  const start = () =>
    act(() =>
      maintPost<SignalBackfillRun>(RUNS_PATH, SURFACE, {
        batch_size: DEFAULT_BATCH,
        mode,
      }),
    );
  const pause = () =>
    run && act(() => maintPost(`${RUNS_PATH}/${run.id}/pause`, SURFACE));
  const resume = () =>
    run && act(() => maintPost(`${RUNS_PATH}/${run.id}/resume`, SURFACE));
  const cancel = () =>
    run && act(() => maintPost(`${RUNS_PATH}/${run.id}/cancel`, SURFACE));

  const pct =
    run && run.total_assets > 0
      ? Math.min(100, Math.round((run.processed_assets / run.total_assets) * 100))
      : 0;
  const running = isActive(run);

  return (
    <section className="rounded-md border border-border/60 bg-muted/10 px-4 py-3 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Durable signal backfill (v5 fingerprint)
        </h3>
        {run && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[run.status]}`}
          >
            {run.status}
            {run.mode ? ` · ${run.mode}` : ''}
            {run.target_scanner_version ? ` · ${run.target_scanner_version}` : ''}
          </span>
        )}
      </header>

      <p className="text-[11px] leading-snug text-muted-foreground">
        <strong>Reprobe</strong> re-runs ffmpeg over every <em>stale</em> video to capture the
        chroma fingerprint + audio/visual metrics (slow, ~1s/clip).{' '}
        <strong>Local reprobe</strong> is the same probe but skips archive-tiered / remote-fetch
        clips, so it grinds only the locally-resolvable library (defer the slow archive tail).{' '}
        <strong>Rescore</strong> skips ffmpeg and re-applies the fingerprint matcher + scoring
        over every previously-scored clip&apos;s stored metrics — the cheap pass to repeat after
        curating <code>signalref:*</code> references or retuning thresholds. Runs one batch at a
        time in the background; resumable across worker restarts.
      </p>

      {loading && !run ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <LoadingSpinner /> Loading…
        </div>
      ) : run ? (
        <div className="space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-sky-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            <span>
              {fmt(run.processed_assets)} / {fmt(run.total_assets)} processed ({pct}%)
            </span>
            <span className="text-emerald-600">{fmt(run.scanned_assets)} scanned</span>
            <span className="text-red-600">{fmt(run.broken_assets)} broken</span>
            <span>{fmt(run.skipped_assets)} skipped</span>
            {run.failed_assets > 0 && (
              <span className="text-red-500">{fmt(run.failed_assets)} failed</span>
            )}
          </div>
          {run.last_error && (
            <p className="text-[10px] text-red-500 break-words">{run.last_error}</p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No reprobe run yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!running && (
          <>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wider text-[10px]">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ReprobeMode)}
                disabled={busy}
                className={`${SELECT_CLS} px-1.5 py-1 text-[11px]`}
                title="Reprobe = full ffmpeg over stale videos; Local reprobe = same but skips archive/remote clips; Rescore = re-apply the matcher over stored metrics (no ffmpeg)"
              >
                <option value="reprobe">Reprobe (all, full ffmpeg)</option>
                <option value="reprobe_local">Local reprobe (skip archive/remote)</option>
                <option value="rescore">Rescore (stored metrics, no ffmpeg)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {run ? `Start new ${MODE_LABELS[mode]}` : `Start ${MODE_LABELS[mode]}`}
            </button>
          </>
        )}
        {run?.status === 'running' && (
          <button
            type="button"
            onClick={pause}
            disabled={busy}
            className="rounded border border-border px-2.5 py-1 text-[11px] disabled:opacity-50"
          >
            Pause
          </button>
        )}
        {run?.status === 'paused' && (
          <button
            type="button"
            onClick={resume}
            disabled={busy}
            className="rounded border border-border px-2.5 py-1 text-[11px] disabled:opacity-50"
          >
            Resume
          </button>
        )}
        {running && (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded border border-red-500/40 px-2.5 py-1 text-[11px] text-red-600 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        {busy && <LoadingSpinner />}
      </div>

      {tuning && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-border/40 pt-2.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Concurrency
            </span>
            <input
              type="number"
              min={CONCURRENCY_MIN}
              max={CONCURRENCY_MAX}
              value={tuning.signal_reprobe_concurrency}
              onChange={(e) =>
                setTuning((t) =>
                  t ? { ...t, signal_reprobe_concurrency: Number(e.target.value) } : t,
                )
              }
              onBlur={(e) =>
                commitTuning(
                  'signal_reprobe_concurrency',
                  clamp(
                    Math.round(Number(e.target.value)) || CONCURRENCY_MIN,
                    CONCURRENCY_MIN,
                    CONCURRENCY_MAX,
                  ),
                )
              }
              className={`w-16 ${FIELD_CLS} px-1.5 py-0.5 text-[11px] tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              ffmpeg threads
            </span>
            <input
              type="number"
              min={THREADS_MIN}
              max={THREADS_MAX}
              value={tuning.signal_reprobe_ffmpeg_threads}
              onChange={(e) =>
                setTuning((t) =>
                  t ? { ...t, signal_reprobe_ffmpeg_threads: Number(e.target.value) } : t,
                )
              }
              onBlur={(e) => {
                const raw = Math.round(Number(e.target.value));
                commitTuning(
                  'signal_reprobe_ffmpeg_threads',
                  clamp(Number.isFinite(raw) ? raw : THREADS_MIN, THREADS_MIN, THREADS_MAX),
                );
              }}
              className={`w-16 ${FIELD_CLS} px-1.5 py-0.5 text-[11px] tabular-nums`}
            />
          </label>
          <p className="max-w-[15rem] text-[10px] leading-snug text-muted-foreground">
            Probe CPU footprint (reprobe only — rescore runs no ffmpeg). Lower if the
            UI lags; raise for speed (threads 0 = ffmpeg auto). Applies on the next batch.
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1 border-t border-border/40 pt-2.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Recent runs
          </div>
          <ul className="space-y-0.5">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground"
              >
                <span
                  className={`rounded px-1 py-0.5 font-medium ${STATUS_CLASS[h.status]}`}
                >
                  {h.status}
                </span>
                <span className="uppercase tracking-wide">{h.mode}</span>
                <span>· {h.target_scanner_version}</span>
                <span className="text-emerald-600">{fmt(h.scanned_assets)} scanned</span>
                {h.broken_assets > 0 && (
                  <span className="text-red-600">{fmt(h.broken_assets)} broken</span>
                )}
                {h.failed_assets > 0 && (
                  <span className="text-red-500">{fmt(h.failed_assets)} failed</span>
                )}
                <span className="ml-auto whitespace-nowrap">{formatRunDate(h)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-[10px] text-red-500 break-words">{error}</p>}
    </section>
  );
}
