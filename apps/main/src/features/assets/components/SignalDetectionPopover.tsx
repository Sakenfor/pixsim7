/**
 * Signal Detection popover (Triage card)
 *
 * On-demand "why was this flagged?" inspector for the broken-video heuristic.
 * Three views over `media_metadata.signal_metrics` (fetched lazily on open via
 * {@link getSignalMetrics} — the list AssetResponse omits the heavy fields):
 *
 *  1. **Chroma heatmap** — the 12×48 pitch-class × time `chroma_fp` melody
 *     fingerprint rendered to a canvas (per-column-normalised so the melodic
 *     contour reads clearly; column energy dims quiet bins). A playhead sweeps
 *     it during playback.
 *  2. **Melody playback** — Web-Audio synthesis of the fingerprint's dominant
 *     pitch-class-per-bin as a short triangle-wave melody, so you can *hear*
 *     whether it's the recurring broken hum or legit music.
 *  3. **Score breakdown** — the per-axis points mirroring
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

// ── Scoring thresholds — MIRROR services/asset/signal_analysis.py (v5). ──
// Kept in sync by hand; the popular axis constants change rarely and are
// documented there. The breakdown recomputes the score so a stale stored value
// is visible as a mismatch rather than silently trusted.
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

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

// ── chroma fingerprint decode ──────────────────────────────────────────────

interface ChromaGrid {
  /** Time bins (typically CHROMA_POOL_BINS = 48). */
  bins: number;
  /** Flat row-major time-major values (bin*12 + pitchClass). */
  data: number[];
  /** Per-time-bin max value (column energy + dominant salience). */
  colMax: number[];
  /** Per-time-bin dominant pitch class (0=C..11=B). */
  argmax: number[];
  globalMax: number;
}

/** Decode the flat `chroma_fp` (12×N row-major) into a renderable grid, or null
 *  when missing/malformed (mirrors audio_fingerprint._to_chroma's guard). */
function decodeChroma(fp?: number[] | null): ChromaGrid | null {
  if (!fp || fp.length < 24 || fp.length % 12 !== 0) return null;
  const bins = fp.length / 12;
  const colMax = new Array<number>(bins).fill(0);
  const argmax = new Array<number>(bins).fill(0);
  let globalMax = 0;
  for (let t = 0; t < bins; t++) {
    let mx = 0;
    let arg = 0;
    for (let pc = 0; pc < 12; pc++) {
      const v = fp[t * 12 + pc] ?? 0;
      if (v > mx) {
        mx = v;
        arg = pc;
      }
    }
    colMax[t] = mx;
    argmax[t] = arg;
    if (mx > globalMax) globalMax = mx;
  }
  return { bins, data: fp, colMax, argmax, globalMax };
}

// Dark→indigo→teal→green→yellow ramp for the heatmap intensity.
const RAMP_STOPS: [number, number, number][] = [
  [8, 10, 28],
  [38, 30, 110],
  [58, 140, 170],
  [120, 200, 120],
  [245, 232, 90],
];
function ramp(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP_STOPS.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP_STOPS[i];
  const b = RAMP_STOPS[Math.min(i + 1, RAMP_STOPS.length - 1)];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(
    a[1] + (b[1] - a[1]) * f,
  )},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

// ── chroma heatmap canvas ──────────────────────────────────────────────────

const CELL_W = 6; // px per time bin (48 bins → 288px)
const CELL_H = 12; // px per pitch class (12 → 144px)

function ChromaHeatmap({
  grid,
  playheadBin,
}: {
  grid: ChromaGrid;
  playheadBin: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { bins, data, colMax, globalMax } = grid;
    const W = canvas.width;
    const H = canvas.height;
    const cw = W / bins;
    const ch = H / 12;
    ctx.clearRect(0, 0, W, H);
    for (let t = 0; t < bins; t++) {
      // Column energy dims quiet bins; per-column norm reveals the contour.
      const energy = globalMax > 0 ? colMax[t] / globalMax : 0;
      const norm = colMax[t] > 1e-6 ? colMax[t] : 1;
      for (let pc = 0; pc < 12; pc++) {
        const v = data[t * 12 + pc] ?? 0;
        const intensity = Math.min(1, (v / norm) * (0.35 + 0.65 * energy));
        ctx.fillStyle = ramp(intensity);
        // pitch class 0 (C) at the bottom row → invert the y axis.
        ctx.fillRect(t * cw, (11 - pc) * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
    if (playheadBin != null && playheadBin >= 0 && playheadBin < bins) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(playheadBin * cw, 0, Math.max(1.5, cw), H);
    }
  }, [grid, playheadBin]);

  return (
    <div className="flex gap-1">
      {/* Pitch-class axis (B at top → C at bottom). */}
      <div
        className="flex flex-col justify-between py-[1px] text-[8px] leading-none text-neutral-400 dark:text-neutral-500"
        style={{ height: CELL_H * 12 }}
      >
        {PITCH_NAMES.slice()
          .reverse()
          .map((n) => (
            <span key={n} className="tabular-nums">
              {n}
            </span>
          ))}
      </div>
      <canvas
        ref={canvasRef}
        width={grid.bins * CELL_W}
        height={12 * CELL_H}
        className="flex-1 rounded ring-1 ring-black/20"
        style={{ imageRendering: 'pixelated', width: '100%', height: CELL_H * 12 }}
      />
    </div>
  );
}

// ── Web-Audio melody playback ──────────────────────────────────────────────

const C4 = 261.63; // playback octave for the (octave-less) pitch classes

/** Synthesize the fingerprint's dominant-pitch-per-bin as a short melody, with
 *  a sweeping playhead. Rests on near-silent bins. Single oscillator + gain
 *  envelope; cleans up on stop / unmount. */
function useChromaMelody(grid: ChromaGrid | null, durationSec: number | null) {
  const [playing, setPlaying] = useState(false);
  const [playheadBin, setPlayheadBin] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) void ctx.close().catch(() => {});
    setPlaying(false);
    setPlayheadBin(null);
  }, []);

  const play = useCallback(() => {
    if (!grid) return;
    stop();
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    ctxRef.current = ctx;
    void ctx.resume().catch(() => {});

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const { bins, colMax, argmax, globalMax } = grid;
    // Match the clip's pace when we know it; otherwise a pleasant default tempo.
    const total = Math.max(1.2, Math.min(12, durationSec && durationSec > 0 ? durationSec : bins * 0.13));
    const step = total / bins;
    const t0 = ctx.currentTime + 0.06;
    const salienceFloor = globalMax * 0.18; // below this a bin reads as a rest

    for (let i = 0; i < bins; i++) {
      const start = t0 + i * step;
      if (colMax[i] <= salienceFloor) {
        gain.gain.setValueAtTime(0, start);
        continue;
      }
      osc.frequency.setValueAtTime(C4 * Math.pow(2, argmax[i] / 12), start);
      // Pluck envelope so adjacent same-pitch notes still articulate.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + Math.min(0.02, step * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + step * 0.92);
    }
    const endAt = t0 + bins * step + 0.05;
    osc.start(t0);
    osc.stop(endAt);
    osc.onended = () => stop();
    setPlaying(true);

    const tick = () => {
      const c = ctxRef.current;
      if (!c) return;
      const elapsed = c.currentTime - t0;
      const bin = Math.floor(elapsed / step);
      if (bin >= bins) {
        stop();
        return;
      }
      setPlayheadBin(bin < 0 ? null : bin);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [grid, durationSec, stop]);

  // Stop on unmount (popover close unmounts the panel).
  useEffect(() => stop, [stop]);

  return { playing, playheadBin, play, stop };
}

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
  const grid = decodeChroma(metrics?.chroma_fp);
  const { playing, playheadBin, play, stop } = useChromaMelody(grid, asset.durationSec ?? null);

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
          {/* Chroma heatmap + melody playback */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Chroma fingerprint
              </span>
              {grid && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (playing) stop();
                    else play();
                  }}
                  className="inline-flex items-center gap-1 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  title="Play the fingerprint's dominant-pitch melody"
                >
                  <Icon name={playing ? 'stop' : 'play'} size={11} />
                  {playing ? 'Stop' : 'Play melody'}
                </button>
              )}
            </div>
            {grid ? (
              <ChromaHeatmap grid={grid} playheadBin={playheadBin} />
            ) : (
              <div className="rounded bg-neutral-100 py-3 text-center text-[11px] text-neutral-400 dark:bg-neutral-800">
                No melody fingerprint (too little audio / older scan).
              </div>
            )}
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
