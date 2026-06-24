/**
 * SignalCalibrationStrip
 *
 * Compact, in-context readout of the video-health calibration report, shown in
 * the Signal Triage surface so flagging visibly "creates better criteria": you
 * watch the detector's grade move and the label counts climb toward the
 * threshold needed to act on a suggested cutoff. Reads `/assets/signal-calibration`
 * (the same report as Settings → Calibration); refetches when `refreshKey` bumps
 * (after each keep/flag). Self-hides on error so non-admins / unavailable
 * backends don't see a broken strip.
 */

import { useEffect, useState } from 'react';

import { getSignalCalibration, type SignalCalibrationReport } from '@lib/api/assets';

function pct(v: number | undefined): string {
  return v === undefined ? '–' : `${Math.round(v * 100)}%`;
}

export function SignalCalibrationStrip({ refreshKey }: { refreshKey?: number }) {
  const [data, setData] = useState<SignalCalibrationReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSignalCalibration()
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Stay quiet when the report can't load (admin-only endpoint) or before first load.
  if (failed || !data) return null;

  const model = data.current_model;
  const cutoff = data.render_ratio?.suggested_cutoff;
  const blind = data.broken_signal_presence;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-400"
      title={data.recommendation}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Criteria
      </span>
      <span className="tabular-nums">
        broken {data.labels.broken}/{data.min_per_class} · clean {data.labels.clean}/{data.min_per_class}
      </span>
      {!data.sufficient ? (
        <span className="text-neutral-400 dark:text-neutral-500">
          label ≥{data.min_per_class}/class to grade the detector
        </span>
      ) : (
        model && (
          <span className="tabular-nums">
            precision{' '}
            <b className="font-medium text-neutral-700 dark:text-neutral-200">{pct(model.precision)}</b>
            {' · '}recall{' '}
            <b className="font-medium text-neutral-700 dark:text-neutral-200">{pct(model.recall)}</b>
            {' · '}
            {model.fp} FP · {model.fn} miss
          </span>
        )
      )}
      {data.sufficient && cutoff && (
        <span className="tabular-nums">
          best cutoff &lt; {cutoff.cutoff} (F1 {pct(cutoff.f1)}) vs {data.render_ratio?.current_weak_cutoff}
        </span>
      )}
      {blind && blind.no_signal > 0 && (
        <span className="text-amber-600 dark:text-amber-400">
          {blind.no_signal}/{blind.of_total} broken trip no signal
        </span>
      )}
    </div>
  );
}
