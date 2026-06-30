/**
 * Signal Detection popover (Triage card)
 *
 * On-demand "why was this flagged?" inspector for the broken-video heuristic.
 * Fetches the clip's `media_metadata.signal_metrics` lazily on open (via
 * {@link getSignalMetrics} — the list AssetResponse omits the heavy fields) and
 * shows two things:
 *
 *  1. **Chroma fingerprint** — the clip's own melody fingerprint as a heatmap +
 *     Web-Audio playback (shared {@link ChromaFingerprint}).
 *  2. **Score breakdown** — the per-axis points mirroring
 *     `services/asset/signal_analysis.score_metrics`, so the 0–6 score is
 *     explained term by term (which axis fired, with the underlying value).
 *
 * Pure read/visualise: no mutations. Keep / Flag stays on the card buttons.
 */

import { Popover, Z } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getSignalMetrics, type SignalMetrics } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import type { AssetModel } from '../models/asset';

import { ChromaFingerprint } from './ChromaFingerprint';

// ── Scoring thresholds — MIRROR services/asset/signal_analysis.py (v5). ──
// Kept in sync by hand; the axis constants change rarely and are documented
// there. The breakdown recomputes the score so a stale stored value is visible
// as a mismatch rather than silently trusted.
const AUDIO_REF_MATCH_STRONG = 0.6;
const AUDIO_REF_MATCH_WEAK = 0.5;
const RENDER_RATIO_STRONG = 0.5;
const RENDER_RATIO_MODERATE = 0.7;
const RENDER_RATIO_WEAK = 0.85;
const FLATNESS_WEAK = 0.38;
const RMS_DB_THRESHOLD = -28.0;
const PEAK_DB_THRESHOLD = -10.0;
const PHASH_FIRST_TO_LAST_THRESHOLD = 20;
const PHASH_MEAN_DIV_THRESHOLD = 22.0;
const SUSPICIOUS_THRESHOLD = 3;

// ── score breakdown ─────────────────────────────────────────────────────────

interface AxisRow {
  label: string;
  kind: 'primary' | 'corroborating';
  points: number;
  value: string;
  note: string;
}

function fmt(v: number | null | undefined, digits = 2, suffix = ''): string {
  return v == null ? '—' : `${v.toFixed(digits)}${suffix}`;
}

/** Recompute the per-axis points, mirroring signal_analysis.score_metrics. */
function buildBreakdown(m: SignalMetrics): { rows: AxisRow[]; total: number } {
  const refMatch = m.audio_ref_match ?? null;
  const refPts = refMatch == null ? 0 : refMatch >= AUDIO_REF_MATCH_STRONG ? 4 : refMatch >= AUDIO_REF_MATCH_WEAK ? 2 : 0;

  const ratio = m.render_ratio ?? null;
  const renderPts =
    ratio == null ? 0 : ratio < RENDER_RATIO_STRONG ? 4 : ratio < RENDER_RATIO_MODERATE ? 2 : ratio < RENDER_RATIO_WEAK ? 1 : 0;

  const flat = m.spectral_flatness ?? null;
  const tonalPts = flat != null && flat < FLATNESS_WEAK ? 1 : 0;

  const rms = m.audio_rms_db ?? null;
  const peak = m.audio_peak_db ?? null;
  const audioQuiet = (rms != null && rms < RMS_DB_THRESHOLD) || (peak != null && peak < PEAK_DB_THRESHOLD);

  const f2l = m.phash_first_to_last ?? null;
  const mdf = m.phash_mean_div_from_first ?? null;
  const visualStatic =
    (f2l != null && f2l < PHASH_FIRST_TO_LAST_THRESHOLD) || (mdf != null && mdf < PHASH_MEAN_DIV_THRESHOLD);

  const rows: AxisRow[] = [
    {
      label: 'Audio fingerprint',
      kind: 'primary',
      points: refPts,
      value: fmt(refMatch),
      note: refMatch == null ? 'no reference match' : `match vs signalref:* (≥${AUDIO_REF_MATCH_STRONG} flags alone)`,
    },
    {
      label: 'Render time',
      kind: 'primary',
      points: renderPts,
      value: fmt(ratio, 2, '×'),
      note: ratio == null ? 'no cohort baseline' : `vs cohort median (<${RENDER_RATIO_STRONG}× = strong fast-fail)`,
    },
    {
      label: 'Tonal flatness',
      kind: 'corroborating',
      points: tonalPts,
      value: fmt(flat),
      note: `spectral flatness (<${FLATNESS_WEAK} nudges +1)`,
    },
    {
      label: 'Audio quiet',
      kind: 'corroborating',
      points: audioQuiet ? 1 : 0,
      value: `${fmt(rms, 1, 'dB')} / ${fmt(peak, 1, 'dB')}`,
      note: `rms<${RMS_DB_THRESHOLD} or peak<${PEAK_DB_THRESHOLD}`,
    },
    {
      label: 'Visual static',
      kind: 'corroborating',
      points: visualStatic ? 1 : 0,
      value: `${f2l ?? '—'} / ${fmt(mdf)}`,
      note: `first→last<${PHASH_FIRST_TO_LAST_THRESHOLD} or mean-div<${PHASH_MEAN_DIV_THRESHOLD}`,
    },
  ];
  return { rows, total: rows.reduce((s, r) => s + r.points, 0) };
}

function ScoreBreakdown({ metrics }: { metrics: SignalMetrics }) {
  const { rows, total } = buildBreakdown(metrics);
  const stored = metrics.score ?? null;
  const suspicious = total >= SUSPICIOUS_THRESHOLD;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Why flagged
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={`rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
              suspicious
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
            }`}
          >
            score {total}/6
          </span>
          {suspicious ? (
            <span className="text-amber-500" title={`≥ ${SUSPICIOUS_THRESHOLD} = broken`}>
              ⚠ broken
            </span>
          ) : (
            <span className="text-emerald-500">✓ clean</span>
          )}
        </span>
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-center gap-2 rounded px-1.5 py-1 text-[11px] ${
              r.points > 0 ? 'bg-amber-500/10' : 'opacity-60'
            }`}
            title={r.note}
          >
            <span
              className={`w-7 shrink-0 text-center font-mono font-semibold tabular-nums ${
                r.points > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'
              }`}
            >
              {r.points > 0 ? `+${r.points}` : '0'}
            </span>
            <span className="flex-1 truncate">
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{r.label}</span>
              <span className="ml-1 text-[9px] uppercase tracking-wide text-neutral-400">
                {r.kind === 'primary' ? 'primary' : 'corrob.'}
              </span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {stored != null && stored !== total && (
        <div className="text-[10px] text-amber-500" title="Stored score differs from a recompute — likely a scanner-version drift; re-scan to refresh.">
          stored score {stored} ≠ recomputed {total} (stale scan)
        </div>
      )}
    </div>
  );
}

// ── detection panel (popover body) ──────────────────────────────────────────

function DetectionPanel({
  asset,
  metrics,
  loading,
  error,
}: {
  asset: AssetModel;
  metrics: SignalMetrics | null | undefined;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div
      className="w-80 space-y-3 rounded-lg border border-neutral-200 bg-white p-3 text-neutral-800 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <Icon name="activity" size={14} className="text-purple-500" />
        <span className="text-sm font-semibold">Detection</span>
        {metrics?.scanner_version && (
          <span className="ml-auto font-mono text-[10px] text-neutral-400">{metrics.scanner_version}</span>
        )}
      </div>

      {loading && <div className="py-6 text-center text-xs text-neutral-400">Loading detection data…</div>}
      {error && <div className="py-4 text-center text-xs text-red-500">{error}</div>}

      {!loading && !error && metrics === null && (
        <div className="py-6 text-center text-xs text-neutral-400">
          No detection data — this clip hasn’t been scanned.
        </div>
      )}

      {!loading && !error && metrics && (
        <>
          {/* Chroma heatmap + melody playback (the clip's OWN fingerprint). */}
          <div className="space-y-1.5">
            <ChromaFingerprint
              label="Chroma fingerprint"
              chromaFp={metrics.chroma_fp}
              durationSec={asset.durationSec ?? null}
            />
            {/* Dynamics context — the "is the melody actually broken" gate. */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
              {metrics.audio_ref_match != null && (
                <span title="Best chroma match to the signalref:* references">
                  match <span className="font-mono">{metrics.audio_ref_match.toFixed(2)}</span>
                </span>
              )}
              {metrics.loudness_range_db != null && (
                <span title="p95−p10 loudness; flat (~6dB) = broken, lively (~15dB) = real">
                  dyn <span className="font-mono">{metrics.loudness_range_db.toFixed(1)}dB</span>
                </span>
              )}
              {metrics.onset_rate != null && (
                <span title="Transient/onset density (onsets/sec)">
                  onsets <span className="font-mono">{metrics.onset_rate.toFixed(1)}/s</span>
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-neutral-200 dark:bg-neutral-700" />

          <ScoreBreakdown metrics={metrics} />
        </>
      )}
    </div>
  );
}

// ── trigger button + popover ────────────────────────────────────────────────

/**
 * "Detection" trigger for a Triage card. Renders only for video assets; opens a
 * popover that lazily fetches and visualises the clip's signal_metrics.
 */
export function SignalDetectionButton({ asset }: { asset: AssetModel }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // undefined = not yet fetched; null = fetched, never scanned.
  const [metrics, setMetrics] = useState<SignalMetrics | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSignalMetrics(asset.id);
      setMetrics(res.signal_metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load detection data');
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  // Re-fetch when pointed at a different asset (cards recycle).
  useEffect(() => {
    setMetrics(undefined);
    setError(null);
  }, [asset.id]);

  if (asset.mediaType !== 'video') return null;

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next && metrics === undefined && !loading) void load();
      return next;
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        title="Detection — chroma fingerprint, melody playback, and score breakdown"
        aria-label="Detection"
        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
          open
            ? 'border-purple-500 bg-purple-600 text-white'
            : 'border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800'
        }`}
      >
        <Icon name="activity" size={12} />
      </button>
      <Popover
        anchor={triggerRef.current}
        open={open}
        placement="top"
        align="center"
        offset={8}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        style={{ zIndex: Z.popover }}
        className="pointer-events-auto"
      >
        <DetectionPanel asset={asset} metrics={metrics} loading={loading} error={error} />
      </Popover>
    </>
  );
}
