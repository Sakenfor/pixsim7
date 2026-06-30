/**
 * ChromaFingerprint — shared chroma heatmap + Web-Audio melody playback.
 *
 * Renders a flat `chroma_fp` (12×N pitch-class × time, row-major time-major) as
 * a canvas heatmap with a sweeping playhead, plus a "Play melody" button that
 * synthesizes the fingerprint's dominant-pitch-per-bin as a short triangle-wave
 * melody (octave-less, single oscillator; a sonification of the pitch contour,
 * not the real clip audio).
 *
 * Shared by the Triage "Detection" popover (an asset's OWN fingerprint) and the
 * Video-Health "References" panel (the curated `signalref:*` template melodies),
 * so both heatmap + playback stay identical.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon } from '@lib/icons';

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
  height = CELL_H * 12,
}: {
  grid: ChromaGrid;
  playheadBin: number | null;
  /** Rendered height in px (the canvas backing size stays fixed/crisp). */
  height?: number;
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
        style={{ height }}
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
        style={{ imageRendering: 'pixelated', width: '100%', height }}
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

  // Stop on unmount.
  useEffect(() => stop, [stop]);

  return { playing, playheadBin, play, stop };
}

// ── public component ─────────────────────────────────────────────────────────

export interface ChromaFingerprintProps {
  /** Flat row-major 12×N chroma fingerprint (null/undefined → empty state). */
  chromaFp?: number[] | null;
  /** Clip duration (sets melody tempo); falls back to a default pace. */
  durationSec?: number | null;
  /** Optional header-left content (e.g. a section label). */
  label?: ReactNode;
  /** Message shown when there's no usable fingerprint. */
  emptyHint?: string;
  /** Heatmap height in px. */
  height?: number;
  className?: string;
}

/** Heatmap + "Play melody" for a chroma fingerprint. Self-contained: owns its
 *  own AudioContext + playhead, cleaned up on unmount. */
export function ChromaFingerprint({
  chromaFp,
  durationSec,
  label,
  emptyHint = 'No melody fingerprint (too little audio / older scan).',
  height,
  className,
}: ChromaFingerprintProps) {
  const grid = decodeChroma(chromaFp);
  const { playing, playheadBin, play, stop } = useChromaMelody(grid, durationSec ?? null);

  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      {(label || grid) && (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              {label}
            </span>
          ) : (
            <span />
          )}
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
      )}
      {grid ? (
        <ChromaHeatmap grid={grid} playheadBin={playheadBin} height={height} />
      ) : (
        <div className="rounded bg-neutral-100 py-3 text-center text-[11px] text-neutral-400 dark:bg-neutral-800">
          {emptyHint}
        </div>
      )}
    </div>
  );
}
