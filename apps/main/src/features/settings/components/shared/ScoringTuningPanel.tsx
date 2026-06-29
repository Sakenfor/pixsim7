import { LoadingSpinner } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  bustStatsCache,
  extractErrorMessage,
  maintGet,
  maintPatch,
  maintPost,
} from './maintenanceShared';

// Mirrors backend ScoringParams (services/asset/signal_scoring_params.py).
// Hand-mirrored (like SignalReprobeRunner's ReprobeTuning) so the panel doesn't
// depend on a regenerated api-model. EVERY field is a score-time threshold — a
// change applies to the library with a cheap RESCORE (no ffmpeg reprobe).
interface ScoringParams {
  audio_ref_match_strong_hi: number;
  audio_ref_match_strong: number;
  audio_ref_match_weak: number;
  audio_ref_lra_gate: number;
  render_ratio_strong: number;
  render_ratio_moderate: number;
  render_ratio_weak: number;
  rms_silence_threshold: number;
  silence_points: number;
  rms_db_threshold: number;
  peak_db_threshold: number;
  phash_first_to_last_threshold: number;
  phash_mean_div_threshold: number;
  flatness_weak: number;
  tonal_frac_threshold: number;
  suspicious_threshold: number;
}

// Backend defaults (signal_scoring_params.py) — for the "reset to defaults"
// affordance and as a fallback if /media/settings hasn't populated signal_scoring.
const DEFAULTS: ScoringParams = {
  audio_ref_match_strong_hi: 0.7,
  audio_ref_match_strong: 0.6,
  audio_ref_match_weak: 0.5,
  audio_ref_lra_gate: 12.0,
  render_ratio_strong: 0.5,
  render_ratio_moderate: 0.7,
  render_ratio_weak: 0.85,
  rms_silence_threshold: -40.0,
  silence_points: 3,
  rms_db_threshold: -25.0,
  peak_db_threshold: -8.0,
  phash_first_to_last_threshold: 20,
  phash_mean_div_threshold: 22.0,
  flatness_weak: 0.38,
  tonal_frac_threshold: 0.55,
  suspicious_threshold: 3,
};

interface Conf {
  tp: number; fp: number; fn: number; tn: number;
  accuracy: number; precision: number; recall: number; f1: number;
}
// Mirrors signal_calibration.preview_calibration().
interface PreviewResponse {
  labels: { broken: number; clean: number; total: number };
  sufficient: boolean;
  min_per_class: number;
  current: Conf | null;
  candidate: Conf | null;
}

interface FieldSpec {
  key: keyof ScoringParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

// Grouped by scoring axis — same axes as the scorer (signal_analysis.score_metrics).
const GROUPS: { title: string; note?: string; fields: FieldSpec[] }[] = [
  {
    title: 'Audio fingerprint match (primary)',
    note: 'Loudness-aware ladder vs the signalref:* reference melodies.',
    fields: [
      { key: 'audio_ref_match_strong_hi', label: 'hi (+4 always)', min: 0, max: 1, step: 0.01 },
      { key: 'audio_ref_match_strong', label: 'strong floor', min: 0, max: 1, step: 0.01 },
      { key: 'audio_ref_match_weak', label: 'weak floor', min: 0, max: 1, step: 0.01 },
      { key: 'audio_ref_lra_gate', label: 'LRA gate (dB)', min: 0, max: 60, step: 0.5 },
    ],
  },
  {
    title: 'Render time vs cohort (primary)',
    note: 'render sec / cohort p50 — lower = faster-failed.',
    fields: [
      { key: 'render_ratio_strong', label: 'strong < (+4)', min: 0, max: 2, step: 0.05 },
      { key: 'render_ratio_moderate', label: 'moderate < (+2)', min: 0, max: 2, step: 0.05 },
      { key: 'render_ratio_weak', label: 'weak < (+1)', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'Near-silence (primary)',
    fields: [
      { key: 'rms_silence_threshold', label: 'rms < (dBFS)', min: -120, max: 0, step: 1 },
      { key: 'silence_points', label: 'points', min: 0, max: 6, step: 1 },
    ],
  },
  {
    title: 'Corroboration (≤ +1 each)',
    fields: [
      { key: 'rms_db_threshold', label: 'quiet: rms < (dBFS)', min: -120, max: 0, step: 1 },
      { key: 'peak_db_threshold', label: 'quiet: peak < (dBFS)', min: -120, max: 0, step: 1 },
      { key: 'phash_first_to_last_threshold', label: 'static: first→last <', min: 0, max: 64, step: 1 },
      { key: 'phash_mean_div_threshold', label: 'static: mean-div <', min: 0, max: 64, step: 0.5 },
      { key: 'flatness_weak', label: 'tonal: flatness <', min: 0, max: 1, step: 0.01 },
      { key: 'tonal_frac_threshold', label: 'tonal: frac >', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: 'Decision',
    fields: [
      { key: 'suspicious_threshold', label: 'broken if score ≥', min: 1, max: 12, step: 1 },
    ],
  },
];

const SURFACE = 'settings:signal-scoring-tuning';
const MEDIA_SETTINGS_PATH = '/media/settings';
const PREVIEW_PATH = '/assets/signal-calibration/preview';
const RUNS_PATH = '/assets/signal-backfill-runs';
const STATS_KEY = '/assets/signal-scan-stats';

const FIELD_CLS =
  'rounded border border-neutral-300 bg-white text-neutral-900 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 disabled:opacity-50';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pct = (v: number | undefined) => (v === undefined ? '–' : `${(v * 100).toFixed(0)}%`);

/** Format a signed delta in percentage points (e.g. "+5pp" / "−3pp"). */
function deltaPP(cand: number, cur: number): { text: string; cls: string; better: boolean } {
  const d = Math.round((cand - cur) * 100);
  const cls = d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-600' : 'text-muted-foreground';
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  return { text: `${sign}${Math.abs(d)}pp`, cls, better: d >= 0 };
}

/**
 * Tune the broken-video (Video Health) scorer and preview the change against your
 * own broken/clean labels BEFORE committing. Edits MediaSettings.signal_scoring;
 * "Preview" re-scores the labelled clips with the candidate thresholds (no
 * probing); "Save & rescore" persists + kicks a rescore so the whole library
 * re-flags without a reprobe. Self-contained, mirrors SignalReprobeRunner.
 */
export function ScoringTuningPanel() {
  const [params, setParams] = useState<ScoringParams | null>(null);
  const [baseline, setBaseline] = useState<ScoringParams | null>(null); // last-saved (server) values
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Load the live scoring params from /media/settings.signal_scoring.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    maintGet<{ signal_scoring?: Partial<ScoringParams> }>(MEDIA_SETTINGS_PATH, SURFACE)
      .then((s) => {
        if (cancelled) return;
        const merged = { ...DEFAULTS, ...(s.signal_scoring ?? {}) };
        setParams(merged);
        setBaseline(merged);
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
  }, []);

  const dirty = useMemo(
    () => !!params && !!baseline && GROUPS.some((g) =>
      g.fields.some((f) => params[f.key] !== baseline[f.key])),
    [params, baseline],
  );

  const setField = useCallback((key: keyof ScoringParams, raw: string) => {
    setParams((p) => (p ? { ...p, [key]: Number(raw) } : p));
    setNotice(null);
  }, []);

  const commitField = useCallback((spec: FieldSpec, raw: string) => {
    const n = Number(raw);
    setParams((p) =>
      p ? { ...p, [spec.key]: clamp(Number.isFinite(n) ? n : DEFAULTS[spec.key], spec.min, spec.max) } : p,
    );
  }, []);

  const runPreview = useCallback(async () => {
    if (!params) return;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await maintPost<PreviewResponse>(PREVIEW_PATH, SURFACE, params));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setPreviewing(false);
    }
  }, [params]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!params) return false;
    setBusy(true);
    setError(null);
    try {
      await maintPatch(MEDIA_SETTINGS_PATH, { signal_scoring: params }, SURFACE);
      setBaseline(params);
      return true;
    } catch (e) {
      setError(extractErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, [params]);

  const saveOnly = useCallback(async () => {
    if (await save()) setNotice('Saved. Run a rescore (here or in the panel below) to apply to the library.');
  }, [save]);

  const saveAndRescore = useCallback(async () => {
    if (!(await save())) return;
    setBusy(true);
    try {
      await maintPost(RUNS_PATH, SURFACE, { mode: 'rescore', batch_size: 200 });
      bustStatsCache(STATS_KEY);
      setNotice('Saved + rescore started. Watch progress in "Durable signal backfill" below.');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [save]);

  const resetDefaults = useCallback(() => {
    setParams({ ...DEFAULTS });
    setNotice(null);
  }, []);

  return (
    <section className="rounded-md border border-border/60 bg-muted/10 px-4 py-3 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Scoring thresholds — tune & preview vs your labels
        </h3>
        {dirty && <span className="text-[10px] text-amber-600">unsaved changes</span>}
      </header>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Every knob is applied at <strong>score time</strong>, so a change re-flags the library with a
        cheap <strong>rescore</strong> (no ffmpeg reprobe). Edit, then <strong>Preview</strong> to see
        the precision/recall it would score against your broken/clean flags before you commit.
      </p>

      {loading && !params ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <LoadingSpinner /> Loading thresholds…
        </div>
      ) : params ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GROUPS.map((g) => (
              <div key={g.title} className="rounded border border-border/40 bg-background/40 p-2 space-y-1.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {g.title}
                </div>
                {g.note && <div className="text-[10px] leading-tight text-muted-foreground/80">{g.note}</div>}
                <div className="space-y-1">
                  {g.fields.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-muted-foreground">{f.label}</span>
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={params[f.key]}
                        onChange={(e) => setField(f.key, e.target.value)}
                        onBlur={(e) => commitField(f, e.target.value)}
                        className={`w-20 ${FIELD_CLS} px-1.5 py-0.5 text-[11px] tabular-nums`}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runPreview}
              disabled={previewing || busy}
              className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
            >
              {previewing ? 'Previewing…' : 'Preview against my labels'}
            </button>
            <button
              type="button"
              onClick={saveOnly}
              disabled={busy || !dirty}
              className="rounded border border-border px-2.5 py-1 text-[11px] disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={saveAndRescore}
              disabled={busy}
              className="rounded border border-border px-2.5 py-1 text-[11px] disabled:opacity-50"
            >
              Save &amp; rescore
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              disabled={busy}
              className="ml-auto rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Reset to defaults
            </button>
            {(busy || previewing) && <LoadingSpinner />}
          </div>

          {preview && <PreviewResult preview={preview} />}
        </>
      ) : null}

      {notice && <p className="text-[10px] text-emerald-600 break-words">{notice}</p>}
      {error && <p className="text-[10px] text-red-500 break-words">{error}</p>}
    </section>
  );
}

function PreviewResult({ preview }: { preview: PreviewResponse }) {
  const { current, candidate, labels, sufficient, min_per_class } = preview;
  if (labels.total === 0) {
    return (
      <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
        No labels yet — flag videos broken/clean as you browse, then preview here.
      </p>
    );
  }
  if (!current || !candidate) return null;
  const dP = deltaPP(candidate.precision, current.precision);
  const dR = deltaPP(candidate.recall, current.recall);
  const dF = deltaPP(candidate.f1, current.f1);
  const dFp = candidate.fp - current.fp; // fewer is better
  const dFn = candidate.fn - current.fn; // fewer is better

  return (
    <div className="border-t border-border/40 pt-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Candidate vs current (re-scored on your labels)
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {labels.broken} broken · {labels.clean} clean{!sufficient && ` (directional — need ≥${min_per_class}/class)`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <DeltaMetric label="precision" cur={current.precision} cand={candidate.precision} d={dP} />
        <DeltaMetric label="recall" cur={current.recall} cand={candidate.recall} d={dR} />
        <DeltaMetric label="F1" cur={current.f1} cand={candidate.f1} d={dF} />
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        False positives{' '}
        <span className="text-foreground">{current.fp} → {candidate.fp}</span>{' '}
        <span className={dFp <= 0 ? 'text-emerald-600' : 'text-red-600'}>
          ({dFp <= 0 ? '−' : '+'}{Math.abs(dFp)})
        </span>{' '}
        · misses{' '}
        <span className="text-foreground">{current.fn} → {candidate.fn}</span>{' '}
        <span className={dFn <= 0 ? 'text-emerald-600' : 'text-red-600'}>
          ({dFn <= 0 ? '−' : '+'}{Math.abs(dFn)})
        </span>
      </p>
    </div>
  );
}

function DeltaMetric({
  label, cur, cand, d,
}: { label: string; cur: number; cand: number; d: { text: string; cls: string } }) {
  return (
    <div className="rounded bg-muted/30 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{pct(cand)}</div>
      <div className="text-[9px] tabular-nums text-muted-foreground">
        was {pct(cur)} <span className={d.cls}>{d.text}</span>
      </div>
    </div>
  );
}
