
import { LoadingSpinner } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import { cachedGet, extractErrorMessage } from './maintenanceShared';

// Mirrors services/asset/signal_calibration.compute_calibration().
interface RatioStats { n: number; p10: number | null; p50: number | null; p90: number | null }
interface SuggestedCutoff { cutoff: number; precision: number; recall: number; f1: number }
interface CalibrationReport {
  scanner_version: string;
  labels: { broken: number; clean: number; total: number };
  sufficient: boolean;
  min_per_class: number;
  current_model?: {
    tp: number; fp: number; fn: number; tn: number;
    accuracy: number; precision: number; recall: number; f1: number;
  };
  render_ratio?: {
    broken: RatioStats; clean: RatioStats;
    current_weak_cutoff: number;
    suggested_cutoff: SuggestedCutoff | null;
  };
  broken_signal_presence?: {
    render_fast: number; audio_quiet: number; visual_static: number;
    no_signal: number; of_total: number;
  };
  recommendation: string;
}

function pct(v: number | undefined): string {
  return v === undefined ? '–' : `${(v * 100).toFixed(0)}%`;
}

export function CalibrationPanel() {
  const [data, setData] = useState<CalibrationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cachedGet<CalibrationReport>('/assets/signal-calibration', 'settings:signal-calibration')
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(extractErrorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="rounded-md border border-border/60 bg-muted/10 px-4 py-3 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Calibration — model vs your flags
        </h3>
        {data && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {data.labels.broken} broken · {data.labels.clean} clean labelled
            {!data.sufficient && ` (need ≥${data.min_per_class}/class)`}
          </span>
        )}
      </header>

      {loading && (
        <div className="flex items-center gap-2 py-1">
          <LoadingSpinner size="xs" />
          <span className="text-xs text-muted-foreground">Loading calibration…</span>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {error}</p>}

      {data && data.labels.total === 0 && (
        <p className="text-xs text-muted-foreground">
          No labels yet. Flag videos broken/clean as you browse, then this report
          grades the detector and proposes tuned thresholds.
        </p>
      )}

      {data && data.current_model && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
          <Metric label="precision" value={pct(data.current_model.precision)} />
          <Metric label="recall" value={pct(data.current_model.recall)} />
          <Metric label="F1" value={pct(data.current_model.f1)} />
          <Metric label="accuracy" value={pct(data.current_model.accuracy)} />
          <div className="col-span-2 sm:col-span-4 text-[11px] text-muted-foreground">
            {data.current_model.fp} false positives · {data.current_model.fn} misses
            {data.render_ratio?.suggested_cutoff && (
              <> · best render cutoff <span className="font-medium text-foreground">
                &lt; {data.render_ratio.suggested_cutoff.cutoff}</span> (F1 {pct(data.render_ratio.suggested_cutoff.f1)})
                vs current {data.render_ratio.current_weak_cutoff}</>
            )}
          </div>
        </div>
      )}

      {data && data.broken_signal_presence && data.broken_signal_presence.no_signal > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          {data.broken_signal_presence.no_signal}/{data.broken_signal_presence.of_total} of your
          broken clips trip no current signal — a blind spot worth a new feature.
        </p>
      )}

      {data && (
        <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
          {data.recommendation}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
