
import { LoadingSpinner } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import { cachedGet, extractErrorMessage } from './maintenanceShared';

interface CohortBucket {
  count: number;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

interface CohortRow {
  provider: string;
  operation_type: string;
  model: string | null;
  quality: string | null;
  requested_length_sec: number | null;
  buckets: Record<string, CohortBucket>;
  suggested_threshold_sec: number | null;
  separation: number | null;
  n_total: number;
  // Baseline the scorer actually uses + the duration below which a clip gets
  // flagged (weak render-ratio cutoff × cohort median). Null = no baseline yet.
  baseline_p50_sec: number | null;
  baseline_n: number | null;
  flag_under_sec: number | null;
}

interface CohortsResponse {
  cohorts: CohortRow[];
  scanner_version: string;
  min_clean_count: number;
  min_suspicious_count: number;
  sample_size: number;
  sample_limit: number;
}

function fmtSec(v: number | null): string {
  if (v === null || v === undefined) return '–';
  return `${v.toFixed(1)}s`;
}

// Green ≥ 0.3 (real signal), amber 0.1–0.3 (weak), red < 0.1 (noise / overlap).
function separationTone(sep: number | null): string {
  if (sep === null) return 'text-muted-foreground';
  if (sep >= 0.3) return 'text-green-600 dark:text-green-400';
  if (sep >= 0.1) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function cohortLabel(c: CohortRow): string {
  const parts = [c.provider, c.operation_type];
  if (c.model) parts.push(c.model);
  if (c.quality) parts.push(c.quality);
  if (c.requested_length_sec) parts.push(`${c.requested_length_sec}s`);
  return parts.join(' · ');
}

export function DurationCohortTable() {
  const [data, setData] = useState<CohortsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cachedGet<CohortsResponse>('/assets/signal-scan-cohorts', 'settings:duration-cohorts')
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(extractErrorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="rounded-md border border-border/60 bg-muted/10 px-4 py-3 space-y-2">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Duration Cohorts
          {data && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
              {data.sample_size.toLocaleString()} of last {data.sample_limit.toLocaleString()} samples
            </span>
          )}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          scorer flags render &lt; <span className="font-medium">flag</span> (0.85 × cohort median); sep = (clean.p10 − susp.p90) / clean.p50
        </span>
      </header>

      {loading && (
        <div className="flex items-center gap-2 py-2">
          <LoadingSpinner size="xs" />
          <span className="text-xs text-muted-foreground">Computing cohort distributions…</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {error}</p>
      )}

      {data && data.cohorts.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No cohorts meet the minimum sample size
          (clean ≥ {data.min_clean_count}, suspicious ≥ {data.min_suspicious_count}).
          Scan more videos and try again.
        </p>
      )}

      {data && data.cohorts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="font-medium pr-3 py-1">Cohort</th>
                <th className="font-medium px-2 py-1 text-right">n clean</th>
                <th className="font-medium px-2 py-1 text-right">n susp</th>
                <th className="font-medium px-2 py-1 text-right">clean p50</th>
                <th className="font-medium px-2 py-1 text-right">susp p50</th>
                <th className="font-medium px-2 py-1 text-right" title="Cohort median render the scorer divides by">scorer p50</th>
                <th className="font-medium px-2 py-1 text-right" title="Clips rendering faster than this get flagged (0.85 × scorer p50)">flag &lt;</th>
                <th className="font-medium pl-2 py-1 text-right">sep</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c, i) => {
                const clean = c.buckets.clean;
                const susp = c.buckets.suspicious;
                return (
                  <tr key={i} className="bg-muted/20">
                    <td className="pr-3 py-1.5 pl-2 rounded-l-sm">{cohortLabel(c)}</td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {clean ? clean.count : '–'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">
                      {susp ? susp.count : '–'}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmtSec(clean?.p50 ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtSec(susp?.p50 ?? null)}</td>
                    <td className="px-2 py-1.5 text-right">{fmtSec(c.baseline_p50_sec)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{fmtSec(c.flag_under_sec)}</td>
                    <td className={`pl-2 pr-2 py-1.5 text-right rounded-r-sm font-medium ${separationTone(c.separation)}`}>
                      {c.separation === null ? '–' : c.separation.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
