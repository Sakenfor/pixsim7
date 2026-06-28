"""Signal-based broken-video heuristic.

Probes a video file's audio and visual characteristics with ffmpeg and
combines them with the generation's *cohort-relative render time* to score
how likely a clip is a degenerate generation (e.g. a fast-failed output where
the model bailed early / returned a canned rejection clip).

Scoring model (v4 — tonal-audio + render dual-primary). See plan
``signal-scan-recalibration`` for the live-data validation behind it:

  * PRIMARY — tonal audio (``spectral_flatness``): < 0.25 strong (+4, flags
    alone), 0.25–0.38 weak (+1, needs corroboration). Broken clips carry
    narrowband synthetic audio (canned refusal voice, pitched "hum" melody,
    silent gibberish; flatness ~0.15-0.25) while genuine clips carry a broadband
    soundtrack (~0.43-0.48). v3 also flagged the 0.25–0.32 mid-band alone (+3);
    on live data ~35% of the broken queue sat there and false-flagged genuine
    tonal/musical clips (e.g. action clips with a sustained score), so that band
    is now corroboration-only.
  * PRIMARY — render ratio vs cohort median (``render_ratio``, supplied by the
    caller from cohort_baselines): < 0.5 strong (+4), < 0.7 moderate (+2),
    < 0.85 weak (+1). Genuine fast-fails render below cohort median — but note
    this barely separates the current library (broken render ~0.98x), so tonal
    audio carries most of the recall now.
  * CORROBORATING ONLY — audio-quiet (rms OR peak below threshold) and
    visual-static (first-to-last OR mean-div below threshold), each +1. The
    two sub-signals per axis are collapsed with OR because they are highly
    correlated (double-counting them was the v1 bug). Modern "failed"
    generations often still animate, so a corroborating axis alone is never
    enough to flag "broken".

``suspicious`` (broken) requires score >= SUSPICIOUS_THRESHOLD (3), reachable
via either primary axis alone (tonal-moderate or render-strong); corroborating
axes alone top out at 2 → borderline, never broken.

Stamps results into `Asset.media_metadata.signal_metrics`:

    {
      "score": 0..6,
      "suspicious": bool,                # score >= SUSPICIOUS_THRESHOLD
      "audio_rms_db": float,
      "audio_peak_db": float,
      "audio_sample_rate": int,
      "audio_channels": int,
      "phash_first_to_last": int,
      "phash_mean_div_from_first": float,
      "spectral_flatness": float | null, # median per-frame flatness (0=tonal, 1=noise)
      "tonal_frac": float | null,        # fraction of frames below FRAME_TONAL_FLATNESS
      "render_ratio": float | null,      # render sec / cohort p50 (null = no baseline)
      "cohort_n": int | null,            # sample size of the cohort baseline used
      "cohort_p50_sec": float | null,    # cohort median render seconds
      "scanned_at": ISO timestamp,
      "scanner_version": str,
      "user_override": "clean" | "broken" | <unset>  # set by override endpoint, never written here
    }

Bump SCANNER_VERSION when scoring changes so callers can detect stale entries
and re-scan.
"""
from __future__ import annotations

import os
import re
import shutil
import statistics
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim_logging import get_logger

logger = get_logger()

# Bump when scoring changes so re-scans can be detected via prev_scanner_version.
SCANNER_VERSION = "v5"

# Corroborating-axis thresholds. Each axis ORs its two sub-signals (they are
# highly correlated; summing them was the v1 double-counting bug) and
# contributes at most +1.
# v5: rms/peak now come from probe_spectral's f32 PCM (one fewer decode — the
# separate ffmpeg `volumedetect` pass is gone). PCM dBFS reads ~+2.8 dB (rms) /
# ~+2.2 dB (peak) HIGHER than volumedetect's reference, so the thresholds are
# shifted up by that offset to keep the (now corroboration-only) audio-quiet axis
# firing equivalently. Approximate by design — it's a +1 nudge, not a primary.
RMS_DB_THRESHOLD = -25.0            # audio-quiet axis: rms below this (was -28 @ volumedetect)
PEAK_DB_THRESHOLD = -8.0           # audio-quiet axis: peak below this (was -10 @ volumedetect)
PHASH_FIRST_TO_LAST_THRESHOLD = 20  # visual-static axis: first→last below this
PHASH_MEAN_DIV_THRESHOLD = 22.0    # visual-static axis: mean-div below this

# Primary signal — render seconds / cohort-median (p50). Lower = faster-failed.
RENDER_RATIO_STRONG = 0.5          # below this → +4 (strong fast-fail)
RENDER_RATIO_MODERATE = 0.7        # below this → +2
RENDER_RATIO_WEAK = 0.85           # below this → +1

SUSPICIOUS_THRESHOLD = 3           # score >= this is flagged broken


def effectively_broken_clause():
    """SQLAlchemy predicate for "this clip is broken" — the single source of
    truth shared by every surface that hides broken clips by default.

    A clip is effectively broken when EITHER:
      * the user manually flagged it (``signal_override == 'broken'``), OR
      * the CURRENT-version heuristic scored it suspicious
        (``signal_score >= SUSPICIOUS_THRESHOLD``) AND the user hasn't rescued it
        with a manual Keep (``signal_override != 'clean'``).

    Stale-version scores never count (a bumped SCANNER_VERSION must be re-scanned
    before its flags take effect), matching the ``signal_likely_broken`` filter.
    The default gallery and the cohort/sibling badge both exclude these; Triage
    and the explicit ``signal_*`` filters opt back in to see them.

    Every leaf is NULL-safe (``IS [NOT] DISTINCT FROM`` / ``coalesce``) so the
    whole expression is three-valued-logic-free: an un-scanned clip (NULL score,
    version, and override) evaluates to ``False`` here, never NULL. That makes
    :func:`not_effectively_broken_clause` (a plain ``~``) keep it, as intended —
    a bare ``score >= 3`` or ``== 'broken'`` would yield NULL and silently drop
    un-scanned rows from a ``WHERE NOT (...)`` filter.
    """
    from sqlalchemy import and_, func, or_

    return or_(
        # Manual flag — NULL-safe equality (NULL override is not a flag).
        Asset.signal_override.is_not_distinct_from("broken"),
        and_(
            # Current-version heuristic, score >= threshold, not user-kept.
            Asset.signal_scanner_version.is_not_distinct_from(SCANNER_VERSION),
            func.coalesce(Asset.signal_score, 0) >= SUSPICIOUS_THRESHOLD,
            Asset.signal_override.is_distinct_from("clean"),
        ),
    )


def not_effectively_broken_clause():
    """Inverse of :func:`effectively_broken_clause` — keep only non-broken clips.

    A plain ``~`` is sound here because every leaf of the wrapped expression is
    NULL-safe, so an un-scanned clip is kept rather than silently dropped.
    """
    return ~effectively_broken_clause()

# Audio-fingerprint axis (v5 — PRIMARY). Best chroma cross-correlation to the
# curated signalref:* references (audio_fingerprint.match_fingerprint). Validated
# on 425 user labels: ~0.6 ≈ 86% precision. Strong flags broken alone (+4); weak
# needs a corroborating axis (+2). Tunable WITHOUT a reprobe — re-scoring reads
# the stored chroma_fp. See plan signal-scan-recalibration.
AUDIO_REF_MATCH_STRONG = 0.60
AUDIO_REF_MATCH_WEAK = 0.50
# Loudness-aware ladder (v5.1). Loudness range (LRA) discriminates synthetic
# broken audio (narrowband refusal voice / pitched hum, low LRA) from a genuine
# dynamic soundtrack (breaths, music, ambience, high LRA) that merely cross-
# correlates with a reference melody (the "good-melody false positive"). So the
# audio match is graded by BOTH similarity and LRA:
#   >= HI (0.70)        → +4 (unambiguous match, flags alone, LRA-independent)
#   STRONG..HI (.60–.70)→ +4 if narrowband else +2 (loud = needs corroboration)
#   WEAK..STRONG (.50–.60) → +2 if narrowband else +1 (loud weak = corrob-only)
# Validated on 436 labels: precision 70%→81% (clean false-positives 92→49) for
# only ~6 lost broken clips (recall 77.5%→75.4%) — strictly better than a flat
# weak->+1 demotion (same precision, higher recall) because it spares narrowband
# weak matches. Missing LRA → treated as narrowband (keeps recall on old probes).
# All tunable WITHOUT a reprobe (re-scoring reads the stored LRA + chroma_fp).
AUDIO_REF_MATCH_STRONG_HI = 0.70
AUDIO_REF_LRA_GATE = 12.0

# Tonal-audio axis (v3 — PRIMARY, alongside render). Genuine i2v outputs carry a
# broadband music+ambience soundtrack; degenerate/guardrail outputs (a canned
# refusal voice "which option would you prefer", a pitched-up "hum" melody, or
# silent gibberish) carry narrowband, synthetic audio. Spectral flatness
# (geo-mean / arith-mean of the magnitude spectrum: ~0 = pure tone, ~1 = white
# noise) separates them cleanly on live data — user-flagged broken cluster at
# ~0.15-0.25 median flatness vs ~0.43-0.48 for genuine clips, with no overlap
# (93% of broken below 0.32, 0% of genuine). It is the single strongest
# discriminator for this library — render time, the v2 primary, barely separates
# (broken render ~0.98x cohort). See plan signal-scan-recalibration.
FLATNESS_STRONG = 0.25     # median flatness below this → +4 (deep broken band; flags alone)
FLATNESS_WEAK = 0.38       # 0.25–0.38 → +1 (ambiguous mid-zone; corroboration-only, never flags alone)
FRAME_TONAL_FLATNESS = 0.15  # per-frame flatness below this counts as a "tonal" frame
SPECTRAL_SR = 16000        # mono decode rate for the spectral probe
SPECTRAL_WIN = 2048        # FFT window (samples)
SPECTRAL_HOP = 1024        # hop between frames (samples)
# Minimum AUDIBLE frames (silence skipped) needed to trust the tonal verdict.
# ~15 frames ≈ 1s of audible audio. Below this the median rests on too little
# signal — e.g. a mostly-silent good clip with a brief musical sting could read
# spuriously tonal — so the probe abstains (flatness=None → tonal axis scores 0)
# rather than risk a false "broken". Real broken hums are tonal throughout (100+
# frames), so this only mutes genuinely under-sampled clips.
MIN_SPECTRAL_FRAMES = 15
# Chroma fingerprint: the (T×12) chromagram is mean-pooled to this many time bins
# so it's fixed-size + storable (12×48 = 576 floats ≈ ~3KB/clip in signal_metrics).
# 48 bins over a ~10s clip ≈ 4–5 bins/sec — enough melodic contour for lag/rotation
# matching against the signalref:* references without persisting every frame.
CHROMA_POOL_BINS = 48

# Probe budget: ffmpeg should be sub-second per clip. Generous timeout to
# absorb cold-cache or contention; if exceeded, treat as probe failure.
PROBE_TIMEOUT_SEC = 60


# ---------- ffmpeg/ffprobe primitives ----------

def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(cmd: list[str], timeout: int = PROBE_TIMEOUT_SEC) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=False, timeout=timeout)


# Per-ffmpeg decode thread cap. The batch reprobe probes many clips concurrently,
# so each ffmpeg defaulting to all cores oversubscribes the CPU (starves the UI on
# a single box). The batch path overrides this via MediaSettings; 0 = ffmpeg auto
# (all cores), fine for one-off inline probes where there is no concurrency.
DEFAULT_FFMPEG_THREADS = 0


def _threads_arg(threads: int) -> list[str]:
    """ffmpeg decode-thread option, injected before ``-i``. Omitted for threads<1
    (ffmpeg's auto default)."""
    return ["-threads", str(threads)] if threads and threads >= 1 else []


def probe_audio(source: str, *, threads: int = DEFAULT_FFMPEG_THREADS) -> dict[str, Optional[float]]:
    """Extract overall audio RMS / peak via volumedetect. `source` is a local
    file path or a fetchable URL (ffmpeg reads both)."""
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        *_threads_arg(threads),
        "-i", source,
        "-af", "volumedetect",
        "-vn", "-f", "null", "-",
    ])
    txt = r.stderr.decode("utf-8", errors="ignore")
    m_mean = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", txt)
    m_peak = re.search(r"max_volume:\s*(-?[\d.]+)\s*dB", txt)
    return {
        "audio_rms_db":  float(m_mean.group(1)) if m_mean else None,
        "audio_peak_db": float(m_peak.group(1)) if m_peak else None,
    }


def probe_streams(source: str) -> dict[str, Optional[float]]:
    """Sample-rate / channels / duration via ffprobe one-shot. `source` is a
    local file path or a fetchable URL."""
    r = _run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_type,sample_rate,channels:format=duration",
        "-of", "default=nw=1", source,
    ])
    txt = r.stdout.decode("utf-8", errors="ignore")
    out: dict[str, Optional[Any]] = {"audio_sample_rate": None, "audio_channels": None, "duration_sec": None}
    for line in txt.splitlines():
        if line.startswith("sample_rate=") and out["audio_sample_rate"] is None:
            v = line.split("=", 1)[1]
            if v.isdigit():
                out["audio_sample_rate"] = int(v)
        elif line.startswith("channels=") and out["audio_channels"] is None:
            v = line.split("=", 1)[1]
            if v.isdigit():
                out["audio_channels"] = int(v)
        elif line.startswith("duration="):
            try:
                out["duration_sec"] = float(line.split("=", 1)[1])
            except ValueError:
                pass
    return out


def _dhash_8x8(gray: bytes, w: int = 9, h: int = 8) -> int:
    bits = 0
    for y in range(h):
        row = gray[y * w:(y + 1) * w]
        for x in range(w - 1):
            bits = (bits << 1) | (1 if row[x + 1] > row[x] else 0)
    return bits


def _hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def probe_phash(source: str, fps: int = 4, *, threads: int = DEFAULT_FFMPEG_THREADS) -> dict[str, Optional[float]]:
    """Decode at low fps/res to grayscale, dhash each frame, return divergence stats.

    Cheap (~1s per 15s clip): ffmpeg drops to 9x8 grayscale at 4fps and writes
    raw bytes to stdout. `source` is a local file path or a fetchable URL.
    """
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        *_threads_arg(threads),
        "-i", source,
        "-vf", f"fps={fps},scale=9:8,format=gray",
        "-f", "rawvideo", "-",
    ])
    raw = r.stdout
    frame_size = 9 * 8
    n = len(raw) // frame_size
    if n < 2:
        return {"phash_first_to_last": None, "phash_mean_div_from_first": None, "phash_frames": n}
    hashes = [_dhash_8x8(raw[i * frame_size:(i + 1) * frame_size]) for i in range(n)]
    first = hashes[0]
    divs = [_hamming(first, h) for h in hashes]
    return {
        "phash_first_to_last":       divs[-1],
        "phash_mean_div_from_first": round(statistics.fmean(divs), 2),
        "phash_frames":              n,
    }


def probe_spectral(source: str, *, threads: int = DEFAULT_FFMPEG_THREADS) -> dict[str, Optional[Any]]:
    """Decode audio ONCE to mono PCM and derive every audio feature in one pass.

    The expensive part of a (re)probe is the ffmpeg decode, so we extract all
    audio signals from a single decode rather than N passes:

    * **spectral flatness / tonal_frac** — legacy v4 tonal axis (kept for
      back-compat / corroboration, no longer the primary).
    * **chroma_fp** — a compact 12×CHROMA_POOL_BINS pitch-class fingerprint
      (per-frame L1-normalized so it's timbre/loudness-invariant, then mean-pooled
      over time). This is the persisted melody fingerprint: matching a candidate
      against the `signalref:*` reference fingerprints (best lag × pitch-rotation
      cross-correlation) is what catches the recurring broken melody — and because
      it's stored, adding new references later re-matches in memory with NO reprobe.
    * **loudness_range_db** — p95−p10 of per-frame loudness; the broken melody is
      flat/lifeless (~6 dB) while a genuine lively clip carrying the same tune has
      real dynamics (~15 dB). The precision gate for "melody present but is it
      actually broken" (see plan: good-melody contamination).
    * **onset_rate** — spectral-flux onsets/sec (drum/transient density).
    * **syllabic_mod** — fraction of loudness-envelope energy in the 2–8 Hz band
      (speech syllabic rate); a cheap voice-rhythm descriptor for the pitchy-
      syllable broken mode.

    `source` is a local path or fetchable URL. numpy is imported lazily. Scalar
    fields are None / chroma_fp is None when there's < ~1s of audible audio.
    """
    import numpy as np

    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        *_threads_arg(threads),
        "-i", source,
        "-ac", "1", "-ar", str(SPECTRAL_SR),
        "-f", "f32le", "-",
    ])
    x = np.frombuffer(r.stdout, dtype=np.float32)

    # Overall loudness (RMS / peak in dBFS) from the SAME PCM — replaces a
    # separate ffmpeg `volumedetect` decode (one fewer decode per clip). Float
    # PCM is full-scale ±1.0 → 0 dBFS, matching volumedetect's reference, so the
    # audio-quiet thresholds carry over. Computed over the whole signal (incl.
    # silence) like volumedetect, before the <1s early-out.
    if x.size:
        peak = float(np.max(np.abs(x)))
        rms = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
        audio_peak_db = round(20.0 * np.log10(peak), 1) if peak > 0 else None
        audio_rms_db = round(20.0 * np.log10(rms), 1) if rms > 0 else None
    else:
        audio_peak_db = audio_rms_db = None

    none: dict[str, Optional[Any]] = {
        "spectral_flatness": None, "tonal_frac": None, "spectral_frames": 0,
        "chroma_fp": None, "loudness_range_db": None, "onset_rate": None,
        "syllabic_mod": None,
        "audio_rms_db": audio_rms_db, "audio_peak_db": audio_peak_db,
    }
    if x.size < SPECTRAL_SR:  # under ~1s of audio — not enough to judge
        return none
    win, hop = SPECTRAL_WIN, SPECTRAL_HOP
    window = np.hanning(win)

    # Per-frame pitch-class map (bins → 0..11 semitone class), restricted to a
    # musically meaningful band. Computed once per call (cheap vs the FFT loop).
    freqs = np.fft.rfftfreq(win, 1.0 / SPECTRAL_SR)
    with np.errstate(divide="ignore"):
        midi = 69 + 12 * np.log2(np.where(freqs > 0, freqs, 1) / 440.0)
    pc = np.mod(np.round(midi).astype(int), 12)
    chroma_band = (freqs >= 60) & (freqs <= 5000)
    pc_band = pc[chroma_band]

    flats: list[float] = []
    tonal = 0
    chroma_rows: list[Any] = []   # per audible frame: L1-normalized 12-vector
    energy: list[float] = []      # per audible frame: linear power (for envelope)
    loud: list[float] = []        # per audible frame: loudness in dB
    flux: list[float] = []        # spectral flux between consecutive audible frames
    prev_mag: Optional[Any] = None
    for i in range(0, len(x) - win, hop):
        mag = np.abs(np.fft.rfft(x[i:i + win] * window)) + 1e-9
        if mag.sum() < 1e-3:  # silent frame — skip; also breaks the flux chain
            prev_mag = None
            continue
        flat = float(np.exp(np.log(mag).mean()) / mag.mean())
        flats.append(flat)
        if flat < FRAME_TONAL_FLATNESS:
            tonal += 1
        c = np.bincount(pc_band, weights=mag[chroma_band], minlength=12)
        c = c / (c.sum() + 1e-9)
        chroma_rows.append(c)
        p = float((mag * mag).sum())
        energy.append(p)
        loud.append(10.0 * np.log10(p + 1e-9))
        if prev_mag is not None:
            flux.append(float(np.maximum(mag - prev_mag, 0.0).sum()))
        prev_mag = mag

    if len(flats) < MIN_SPECTRAL_FRAMES:
        # Too little audible audio to judge — abstain (don't flag), keep the count.
        return {**none, "spectral_frames": len(flats)}

    # --- chroma fingerprint: mean-pool the (T×12) chromagram to CHROMA_POOL_BINS
    # time bins (coarse melodic contour, fixed-size + storable). ---
    C = np.asarray(chroma_rows)  # (T, 12)
    edges = np.linspace(0, len(C), CHROMA_POOL_BINS + 1).astype(int)
    fp = np.stack([
        C[edges[k]:max(edges[k] + 1, edges[k + 1])].mean(axis=0)
        for k in range(CHROMA_POOL_BINS)
    ])  # (CHROMA_POOL_BINS, 12)
    chroma_fp = [round(float(v), 4) for v in fp.flatten()]

    # --- dynamics ---
    loud_arr = np.asarray(loud)
    loudness_range_db = float(np.percentile(loud_arr, 95) - np.percentile(loud_arr, 10))
    dur_sec = len(x) / float(SPECTRAL_SR)
    flux_arr = np.asarray(flux)
    onsets = int((flux_arr > flux_arr.mean() + flux_arr.std()).sum()) if flux_arr.size else 0
    onset_rate = onsets / dur_sec if dur_sec > 0 else 0.0

    # --- syllabic modulation: energy of the loudness envelope in the 2–8 Hz
    # speech-rate band (FFT of the per-frame power envelope; frame rate = SR/hop). ---
    env = np.asarray(energy)
    env = env - env.mean()
    emag = np.abs(np.fft.rfft(env))
    efreq = np.fft.rfftfreq(len(env), hop / float(SPECTRAL_SR))
    band = (efreq >= 2.0) & (efreq <= 8.0)
    syllabic_mod = float(emag[band].sum() / (emag.sum() + 1e-9))

    return {
        "spectral_flatness": round(float(np.median(flats)), 4),
        "tonal_frac":        round(tonal / len(flats), 4),
        "spectral_frames":   len(flats),
        "chroma_fp":         chroma_fp,
        "loudness_range_db": round(loudness_range_db, 2),
        "onset_rate":        round(float(onset_rate), 2),
        "syllabic_mod":      round(syllabic_mod, 4),
        "audio_rms_db":      audio_rms_db,
        "audio_peak_db":     audio_peak_db,
    }


# ---------- scoring ----------

def _render_points(render_ratio: Optional[float]) -> int:
    """Graded points for the cohort-relative render-time signal (a primary axis)."""
    if render_ratio is None:
        return 0
    if render_ratio < RENDER_RATIO_STRONG:
        return 4
    if render_ratio < RENDER_RATIO_MODERATE:
        return 2
    if render_ratio < RENDER_RATIO_WEAK:
        return 1
    return 0


def _tonal_points(flatness: Optional[float]) -> int:
    """CORROBORATING points for low spectral flatness (≤ +1).

    v5 DEMOTED this from a primary axis. On 425 user labels tonal flatness did
    NOT separate broken from kept (clean 0.265 vs broken 0.242) — it fired on
    legitimate tonal MUSIC beds, and the old <0.25→+4 (flags-alone) band was the
    main false-positive engine. The audio-fingerprint match is the new primary
    audio signal; flatness is now just one corroborating axis (any tonal-ish
    audio nudges +1, never flags broken on its own). See signal-scan-recalibration.
    """
    if flatness is None:
        return 0
    return 1 if flatness < FLATNESS_WEAK else 0


def _audio_ref_points(
    audio_ref_match: Optional[float], loudness_range_db: Optional[float] = None
) -> int:
    """Graded points for the broken-audio fingerprint match (PRIMARY, v5).

    Match against the curated `signalref:*` references (best time-lag × pitch-
    rotation chroma xcorr). A strong match flags broken on its own; a weaker
    match needs a corroborating axis to reach 'broken'. None = no fingerprint /
    no references loaded → 0 (falls back to render + corroboration).

    Graded by similarity AND loudness range (see AUDIO_REF_LRA_GATE): a genuine
    dynamic soundtrack (wide LRA — breaths/music) that merely echoes a reference
    melody is down-weighted, so a borderline match on a loud clip needs
    corroboration instead of flagging alone. Missing LRA is treated as narrowband
    so older probes keep their recall.
    """
    if audio_ref_match is None:
        return 0
    narrowband = loudness_range_db is None or loudness_range_db < AUDIO_REF_LRA_GATE
    if audio_ref_match >= AUDIO_REF_MATCH_STRONG_HI:
        return 4                                    # unambiguous — flags alone
    if audio_ref_match >= AUDIO_REF_MATCH_STRONG:   # 0.60–0.70
        return 4 if narrowband else 2               # loud → genuine, demote to weak
    if audio_ref_match >= AUDIO_REF_MATCH_WEAK:     # 0.50–0.60
        return 2 if narrowband else 1               # loud weak → corroboration-only
    return 0


def score_metrics(
    metrics: dict[str, Any],
    render_ratio: Optional[float] = None,
    audio_ref_match: Optional[float] = None,
) -> tuple[int, bool]:
    """Compute (score, suspicious) from probed metrics + optional render ratio.

    Two PRIMARY axes, each graded and each able to flag on its own:
      * audio-fingerprint match vs the curated signalref:* references: 0/+2/+4
        (v5's strongest audio discriminator — see _audio_ref_points);
      * render time vs cohort: 0/+1/+2/+4.
    Plus three CORROBORATING axes worth at most +1 each — tonal flatness (v5
    demoted it here from a primary axis), audio-quiet, and visual-static; the
    latter two each OR their two correlated sub-signals rather than summing them.
    ``suspicious`` (score >= 3) is reachable via either primary axis alone; a
    single corroborating axis never flags, but all three lit together reach 3.
    """
    rms  = metrics.get("audio_rms_db")
    peak = metrics.get("audio_peak_db")
    f2l  = metrics.get("phash_first_to_last")
    mdf  = metrics.get("phash_mean_div_from_first")
    flatness = metrics.get("spectral_flatness")
    lra  = metrics.get("loudness_range_db")

    audio_quiet = (
        (rms  is not None and rms  < RMS_DB_THRESHOLD) or
        (peak is not None and peak < PEAK_DB_THRESHOLD)
    )
    visual_static = (
        (f2l  is not None and f2l  < PHASH_FIRST_TO_LAST_THRESHOLD) or
        (mdf  is not None and mdf  < PHASH_MEAN_DIV_THRESHOLD)
    )

    # Primaries (each can flag broken alone): audio-fingerprint match + render.
    # Corroborating (≤ +1 each): tonal flatness, audio-quiet, visual-static.
    score = _audio_ref_points(audio_ref_match, lra) + _render_points(render_ratio)
    score += _tonal_points(flatness)
    if audio_quiet:
        score += 1
    if visual_static:
        score += 1
    return score, score >= SUSPICIOUS_THRESHOLD


# ---------- combined per-file probe ----------

def probe_path(source: str | Path, *, ffmpeg_threads: int = DEFAULT_FFMPEG_THREADS) -> dict[str, Any]:
    """Run all probes against a video and return the full metrics dict.

    `source` is a local file path OR a fetchable URL (e.g. a presigned S3/MinIO
    URL for an archive-tiered asset) — ffmpeg reads both, so no local copy is
    needed. ``ffmpeg_threads`` caps per-ffmpeg decode threads (0 = auto); the
    batch reprobe lowers it to avoid CPU oversubscription under concurrency. Does
    NOT include `score` / `suspicious` (call `score_metrics`) and does NOT touch
    the database.

    Raises:
        FileNotFoundError: if a LOCAL path doesn't exist (URLs aren't checked)
        RuntimeError: if ffmpeg/ffprobe are not available
        subprocess.TimeoutExpired: if a probe exceeds PROBE_TIMEOUT_SEC
    """
    s = str(source)
    is_url = s.startswith(("http://", "https://"))
    if not is_url and not Path(s).exists():
        raise FileNotFoundError(s)
    if not _ffmpeg_available():
        raise RuntimeError("ffmpeg/ffprobe not available in PATH")
    out: dict[str, Any] = {}
    out.update(probe_streams(s))
    out.update(probe_phash(s, threads=ffmpeg_threads))
    # probe_spectral now also yields audio_rms_db/peak from its PCM decode, so the
    # separate probe_audio (volumedetect) pass is no longer needed.
    out.update(probe_spectral(s, threads=ffmpeg_threads))
    return out


def build_signal_metrics_payload(
    metrics: dict[str, Any],
    render_context: Optional[dict[str, Any]] = None,
    audio_ref_match: Optional[float] = None,
) -> dict[str, Any]:
    """Wrap a probed metrics dict into the canonical `signal_metrics` shape.

    ``render_context`` (from ``cohort_baselines.render_context_for_asset``)
    supplies the render-time signal. ``audio_ref_match`` (from
    ``audio_fingerprint.match_fingerprint`` against the `signalref:*` references)
    is the primary audio signal — passed in by the caller because it needs the
    loaded reference set. Both default to None → corroboration-only scoring.
    Excludes `user_override` (only the override endpoint writes that).
    """
    rc = render_context or {}
    render_ratio = rc.get("render_ratio")
    score, suspicious = score_metrics(
        metrics, render_ratio=render_ratio, audio_ref_match=audio_ref_match
    )
    return {
        "score":                     score,
        "suspicious":                suspicious,
        "audio_rms_db":              metrics.get("audio_rms_db"),
        "audio_peak_db":             metrics.get("audio_peak_db"),
        "audio_sample_rate":         metrics.get("audio_sample_rate"),
        "audio_channels":            metrics.get("audio_channels"),
        "phash_first_to_last":       metrics.get("phash_first_to_last"),
        "phash_mean_div_from_first": metrics.get("phash_mean_div_from_first"),
        "spectral_flatness":         metrics.get("spectral_flatness"),
        "tonal_frac":                metrics.get("tonal_frac"),
        # Audio fingerprint + dynamics (v5) — persisted so reference matching and
        # the future kick-gate run on stored data without another decode.
        "chroma_fp":                 metrics.get("chroma_fp"),
        "loudness_range_db":         metrics.get("loudness_range_db"),
        "onset_rate":                metrics.get("onset_rate"),
        "syllabic_mod":              metrics.get("syllabic_mod"),
        "audio_ref_match":           audio_ref_match,
        "render_ratio":              render_ratio,
        "cohort_n":                  rc.get("cohort_n"),
        "cohort_p50_sec":            rc.get("cohort_p50_sec"),
        "scanned_at":                datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scanner_version":           SCANNER_VERSION,
    }


# Sentinel: "no precomputed match supplied — compute inline". Distinct from a
# real None result (= candidate didn't match any reference). Imported by the
# backfill service so its batch-parallel matcher can pass a precomputed value.
_UNSET: Any = object()


def _match_audio_ref(
    chroma_fp: Any, ref_fingerprints: Optional[list[Any]]
) -> Optional[float]:
    """Best fingerprint match of a stored/probed chroma_fp to the references.

    Best-effort: returns None when there's no fingerprint, no references, or the
    matcher errors — so scoring cleanly falls back to render + corroboration.
    Imported lazily to keep this module's import cheap and avoid a cycle.
    """
    if not chroma_fp or not ref_fingerprints:
        return None
    try:
        from pixsim7.backend.main.services.asset.audio_fingerprint import (
            match_fingerprint,
        )
        return match_fingerprint(chroma_fp, ref_fingerprints)
    except Exception as e:  # noqa: BLE001 — fingerprint match is best-effort
        logger.warning("signal_audio_ref_match_failed", error=str(e))
        return None


# ---------- stale-video selection (shared by sync endpoint + durable run) ----------

def stale_signal_video_conditions(
    scanner_version: str, user_id: int, *, local_only: bool = False
) -> list:
    """SQLAlchemy WHERE conditions selecting probe-eligible STALE videos.

    "Stale" = signal_scanner_version distinct from ``scanner_version``;
    "probe-eligible" = a VIDEO, not archived, with a resolvable source (a local
    path OR a stored_key — the same bar as ``SignalAnalysisService.is_eligible``,
    so archive-tiered files probed via presigned URL are included).

    ``local_only=True`` additionally restricts to clips with a LOCAL file
    (``local_path`` present), excluding archive-tiered clips that would otherwise
    be fetched per-clip over the network (MinIO/ZeroTier) — by far the slowest
    path. A local-first reprobe gets the bulk (and the local `signalref:*`
    references) to the new scanner fast, so the matcher can go live without
    waiting on the remote tier; a normal run mops up the archive afterward.

    The single source of truth for "which videos need a (re)probe", composed by
    the sync endpoint and the durable ``SignalBackfillService`` (cursor-paged).
    """
    from sqlalchemy import or_

    conds = [
        Asset.user_id == user_id,
        Asset.media_type == "VIDEO",
        Asset.is_archived == False,  # noqa: E712
        Asset.signal_scanner_version.is_distinct_from(scanner_version),
        or_(Asset.local_path.isnot(None), Asset.stored_key.isnot(None)),
    ]
    if local_only:
        conds.append(Asset.local_path.isnot(None))
    return conds


# ---------- service: stamp into Asset.media_metadata ----------

# Sentinel for "no prefetched probe supplied" — distinct from a prefetched
# ``None`` (which means "probe ran but found no usable source / failed").
_UNSET = object()


class SignalAnalysisService:
    """Stamp signal-analysis metrics onto Asset.media_metadata.signal_metrics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def is_eligible(asset: Asset) -> bool:
        """Video assets with a resolvable file — a local path OR a stored_key
        (incl. archive-tiered files we can probe via a presigned URL)."""
        media_type = getattr(asset, "media_type", None)
        media_type_str = getattr(media_type, "value", media_type)
        if str(media_type_str).lower() != "video":
            return False
        return bool(asset.local_path or asset.stored_key)

    def _resolve_probe_source(self, asset: Asset) -> Optional[str]:
        """Resolve a ffmpeg-readable source for `asset` WITHOUT copying.

        Prefers an existing local file; otherwise resolves the ``stored_key`` on
        its storage root — a canonical local path for local roots, or a
        presigned URL for non-local (S3/MinIO archive) roots that ffmpeg streams
        directly. Returns None if nothing is resolvable.
        """
        if asset.local_path and Path(asset.local_path).exists():
            return asset.local_path
        if not asset.stored_key:
            return None
        try:
            from pixsim7.backend.main.services.storage import get_storage_service

            storage = get_storage_service()
            root_id = asset.storage_root_id or None
            if storage.is_local(root_id):
                canonical = storage.local_path_if_local(asset.stored_key, root_id)
                return canonical if canonical and Path(canonical).exists() else None
            # Non-local (archive): a presigned URL ffmpeg can stream — no copy.
            url = storage.get_url(asset.stored_key, root_id=root_id)
            return url if str(url).startswith(("http://", "https://")) else None
        except Exception as e:  # noqa: BLE001 — resolution is best-effort
            logger.warning("signal_analysis_resolve_failed", asset_id=asset.id, error=str(e))
            return None

    def probe_raw(
        self, asset: Asset, *, ffmpeg_threads: int = DEFAULT_FFMPEG_THREADS
    ) -> Optional[dict[str, Any]]:
        """Resolve a ffmpeg source and run the full probe — the heavy, DB-FREE
        half of :meth:`probe_and_stamp`.

        Touches no DB session, so it is safe to run off the event loop (e.g. via
        ``asyncio.to_thread``) to parallelise a batch's ffmpeg spawns.
        ``ffmpeg_threads`` caps per-ffmpeg decode threads under that concurrency.
        Returns the raw metrics dict, or ``None`` if the asset is ineligible, has
        no resolvable source, or the probe failed.
        """
        if not self.is_eligible(asset):
            return None
        source = self._resolve_probe_source(asset)
        if source is None:
            logger.debug("signal_analysis_skip_no_source", asset_id=asset.id)
            return None
        try:
            return probe_path(source, ffmpeg_threads=ffmpeg_threads)
        except (FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as e:
            logger.warning("signal_analysis_probe_failed", asset_id=asset.id, error=str(e))
            return None
        except Exception as e:  # noqa: BLE001 — never let a probe crash ingest
            logger.warning("signal_analysis_probe_unexpected", asset_id=asset.id, error=str(e), exc_info=True)
            return None

    async def probe_and_stamp(
        self,
        asset: Asset,
        *,
        force: bool = False,
        commit: bool = True,
        cohort_baselines: Optional[dict[str, Any]] = None,
        ref_fingerprints: Optional[list[Any]] = None,
        prefetched: Any = _UNSET,
    ) -> Optional[dict[str, Any]]:
        """Probe `asset` and stamp signal_metrics on it.

        Args:
            asset: an Asset row already loaded in the session.
            force: re-scan even if scanner_version matches the current version.
            commit: commit the session after stamping. Set False when the caller
                runs inside a larger transaction.
            cohort_baselines: cached ``{cohort_key: {p10, p50, n}}`` map (from
                ``cohort_baselines.load_cohort_baselines``). When provided, the
                asset's cohort-relative render time becomes the primary signal.
                Omit it (or pass an empty map) for corroboration-only scoring.

        Returns:
            The new signal_metrics dict on success, or None if the asset was
            skipped (ineligible / already up-to-date / probe failed).
        """
        if not self.is_eligible(asset):
            return None

        existing = (asset.media_metadata or {}).get("signal_metrics") or {}
        if not force and existing.get("scanner_version") == SCANNER_VERSION:
            return None

        # Use a batch-prefetched probe when supplied (parallel ffmpeg pre-pass);
        # otherwise probe inline. ``None`` is a valid prefetched value meaning
        # "no usable source / probe failed" — hence the ``_UNSET`` sentinel.
        raw = self.probe_raw(asset) if prefetched is _UNSET else prefetched
        if raw is None:
            return None

        render_context = None
        if cohort_baselines:
            try:
                from pixsim7.backend.main.services.asset.cohort_baselines import (
                    render_context_for_asset,
                )
                render_context = await render_context_for_asset(
                    self.db, asset, cohort_baselines
                )
            except Exception as e:  # noqa: BLE001 — render signal is best-effort
                logger.warning("signal_analysis_render_ctx_failed", asset_id=asset.id, error=str(e))

        # Auto-load the broken-audio references when the caller didn't supply
        # them (ingest / one-off probes pass None) so the fingerprint matcher —
        # a PRIMARY v5 signal — is never silently skipped on a fresh clip. A
        # caller that loads its own set (the durable backfill) passes a list
        # (possibly empty) and is left untouched; an empty list stays empty. Only
        # bother when the probe actually produced a fingerprint to match.
        if ref_fingerprints is None and raw.get("chroma_fp"):
            from pixsim7.backend.main.services.asset.audio_fingerprint import (
                get_reference_fingerprints_cached,
            )
            ref_fingerprints = await get_reference_fingerprints_cached(self.db)
        audio_ref_match = _match_audio_ref(raw.get("chroma_fp"), ref_fingerprints)
        payload = build_signal_metrics_payload(
            raw, render_context, audio_ref_match=audio_ref_match
        )

        # Merge into media_metadata, preserving an existing user_override.
        meta = dict(asset.media_metadata or {})
        prev = dict(meta.get("signal_metrics") or {})
        if "user_override" in prev:
            payload["user_override"] = prev["user_override"]
        meta["signal_metrics"] = payload
        asset.media_metadata = meta  # reassignment triggers SQLAlchemy SET on JSON column

        # Mirror into the flat denormalized columns the maintenance dashboard
        # aggregates over (avoids de-TOASTing media_metadata per video).
        asset.signal_score = payload.get("score")
        asset.signal_scanner_version = payload.get("scanner_version")
        asset.signal_override = payload.get("user_override")

        self.db.add(asset)
        if commit:
            await self.db.commit()
        return payload

    # Probe metric keys that must already be present to re-score without ffmpeg.
    _STORED_PROBE_KEYS = (
        "audio_rms_db", "audio_peak_db",
        "phash_first_to_last", "phash_mean_div_from_first",
        "chroma_fp",
    )

    async def rescore_from_stored(
        self,
        asset: Asset,
        *,
        cohort_baselines: Optional[dict[str, Any]] = None,
        ref_fingerprints: Optional[list[Any]] = None,
        precomputed_match: Any = _UNSET,
        commit: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Recompute the score from ALREADY-STORED ffmpeg metrics — no probing.

        Use when only the scoring model changed (a SCANNER_VERSION bump), not
        the probes themselves: the audio/visual metrics from the prior scan are
        reused as-is and merely re-scored, now folding in the cohort-relative
        render signal. No ffmpeg, no local file required — so a full-library
        re-score is a cheap DB pass instead of hours of decoding.

        Returns the new payload, or None if the asset has no stored probe
        metrics to score from (it would need a real ``probe_and_stamp``).
        """
        existing = (asset.media_metadata or {}).get("signal_metrics") or {}
        if not any(existing.get(k) is not None for k in self._STORED_PROBE_KEYS):
            return None

        render_context = None
        if cohort_baselines:
            try:
                from pixsim7.backend.main.services.asset.cohort_baselines import (
                    render_context_for_asset,
                )
                render_context = await render_context_for_asset(
                    self.db, asset, cohort_baselines
                )
            except Exception as e:  # noqa: BLE001 — render signal is best-effort
                logger.warning("signal_rescore_render_ctx_failed", asset_id=asset.id, error=str(e))

        # build_signal_metrics_payload reads the same metric keys the stored
        # dict already carries, so the prior probe values flow straight through.
        # The fingerprint match is recomputed from the stored chroma_fp vs the
        # loaded references — so adding/removing references needs only a re-score.
        # The batch backfill can run the (CPU-heavy) matcher in a thread pool and
        # hand the result in via precomputed_match; otherwise compute it inline.
        if precomputed_match is _UNSET:
            audio_ref_match = _match_audio_ref(existing.get("chroma_fp"), ref_fingerprints)
        else:
            audio_ref_match = precomputed_match
        payload = build_signal_metrics_payload(
            existing, render_context, audio_ref_match=audio_ref_match
        )
        if existing.get("user_override") is not None:
            payload["user_override"] = existing["user_override"]

        meta = dict(asset.media_metadata or {})
        meta["signal_metrics"] = payload
        asset.media_metadata = meta
        asset.signal_score = payload.get("score")
        asset.signal_scanner_version = payload.get("scanner_version")
        asset.signal_override = payload.get("user_override")

        self.db.add(asset)
        if commit:
            await self.db.commit()
        return payload

    async def score_render_only(
        self,
        asset: Asset,
        *,
        cohort_baselines: dict[str, Any],
        commit: bool = True,
    ) -> Optional[dict[str, Any]]:
        """Score a never-probed video from its render signal ALONE — no file.

        Render time is the primary signal and comes from the generation's
        timing vs the cohort baseline (DB only), so a clip with no stored
        audio/visual metrics — including archive-tiered files with no local
        copy — can still be scored without ffmpeg or a fetch. The payload is
        tagged ``scan_mode='render_only'`` (audio/visual fields null) so it's
        an honest partial that a later full probe can upgrade.

        Under the conservative model only a strong fast render (ratio < 0.5)
        flags broken without corroboration; everything else lands clean/
        borderline. Returns the payload, or None if there's no usable render
        context (no generation timing / cold cohort).
        """
        from pixsim7.backend.main.services.asset.cohort_baselines import (
            render_context_for_asset,
        )

        render_context = await render_context_for_asset(self.db, asset, cohort_baselines)
        if render_context is None or render_context.get("render_ratio") is None:
            return None

        # Empty probe metrics → audio/visual axes don't fire; score is the
        # render signal only. Tag it so full scans (no scan_mode) stay distinct.
        payload = build_signal_metrics_payload({}, render_context)
        payload["scan_mode"] = "render_only"
        existing = (asset.media_metadata or {}).get("signal_metrics") or {}
        if existing.get("user_override") is not None:
            payload["user_override"] = existing["user_override"]

        meta = dict(asset.media_metadata or {})
        meta["signal_metrics"] = payload
        asset.media_metadata = meta
        asset.signal_score = payload.get("score")
        asset.signal_scanner_version = payload.get("scanner_version")
        asset.signal_override = payload.get("user_override")

        self.db.add(asset)
        if commit:
            await self.db.commit()
        return payload
