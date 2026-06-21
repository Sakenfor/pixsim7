"""Signal-based broken-video heuristic.

Probes a video file's audio and visual characteristics with ffmpeg and
combines them with the generation's *cohort-relative render time* to score
how likely a clip is a degenerate generation (e.g. a fast-failed output where
the model bailed early / returned a canned rejection clip).

Scoring model (v3 — tonal-audio + render dual-primary). See plan
``signal-scan-recalibration`` for the live-data validation behind it:

  * PRIMARY — tonal audio (``spectral_flatness``): < 0.25 strong (+4), < 0.32
    moderate (+3), < 0.38 weak (+1). The single strongest discriminator on live
    data — broken clips carry narrowband synthetic audio (canned refusal voice,
    pitched "hum" melody, silent gibberish; flatness ~0.15-0.25) while genuine
    clips carry a broadband soundtrack (~0.43-0.48), with no overlap.
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
SCANNER_VERSION = "v3"

# Corroborating-axis thresholds. Each axis ORs its two sub-signals (they are
# highly correlated; summing them was the v1 double-counting bug) and
# contributes at most +1.
RMS_DB_THRESHOLD = -28.0            # audio-quiet axis: rms below this
PEAK_DB_THRESHOLD = -10.0          # audio-quiet axis: peak below this
PHASH_FIRST_TO_LAST_THRESHOLD = 20  # visual-static axis: first→last below this
PHASH_MEAN_DIV_THRESHOLD = 22.0    # visual-static axis: mean-div below this

# Primary signal — render seconds / cohort-median (p50). Lower = faster-failed.
RENDER_RATIO_STRONG = 0.5          # below this → +4 (strong fast-fail)
RENDER_RATIO_MODERATE = 0.7        # below this → +2
RENDER_RATIO_WEAK = 0.85           # below this → +1

SUSPICIOUS_THRESHOLD = 3           # score >= this is flagged broken

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
FLATNESS_MODERATE = 0.32   # below this → +3 (still clear of the clean band; flags alone)
FLATNESS_WEAK = 0.38       # below this → +1 (ambiguous mid-zone; needs corroboration)
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

# Probe budget: ffmpeg should be sub-second per clip. Generous timeout to
# absorb cold-cache or contention; if exceeded, treat as probe failure.
PROBE_TIMEOUT_SEC = 60


# ---------- ffmpeg/ffprobe primitives ----------

def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(cmd: list[str], timeout: int = PROBE_TIMEOUT_SEC) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=False, timeout=timeout)


def probe_audio(source: str) -> dict[str, Optional[float]]:
    """Extract overall audio RMS / peak via volumedetect. `source` is a local
    file path or a fetchable URL (ffmpeg reads both)."""
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
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


def probe_phash(source: str, fps: int = 4) -> dict[str, Optional[float]]:
    """Decode at low fps/res to grayscale, dhash each frame, return divergence stats.

    Cheap (~1s per 15s clip): ffmpeg drops to 9x8 grayscale at 4fps and writes
    raw bytes to stdout. `source` is a local file path or a fetchable URL.
    """
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
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


def probe_spectral(source: str) -> dict[str, Optional[float]]:
    """Decode audio to mono PCM and measure spectral flatness / tonal fraction.

    Per-frame spectral flatness is the geometric mean over the arithmetic mean of
    the magnitude spectrum (~0 for a pure tone, ~1 for white noise). Degenerate
    generations (canned refusal voice, pitched "hum" melody, silent gibberish)
    carry narrowband synthetic audio → low flatness; genuine clips carry a
    broadband music+ambience mix → high flatness. `source` is a local file path
    or a fetchable URL (ffmpeg reads both). numpy is imported lazily so importing
    this module stays cheap for callers that never probe.

    Returns the median flatness across frames and the fraction of "tonal" frames
    (flatness < FRAME_TONAL_FLATNESS). Values are None when there is no decodable
    audio (≥ ~1s required).
    """
    import numpy as np

    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", source,
        "-ac", "1", "-ar", str(SPECTRAL_SR),
        "-f", "f32le", "-",
    ])
    x = np.frombuffer(r.stdout, dtype=np.float32)
    none = {"spectral_flatness": None, "tonal_frac": None, "spectral_frames": 0}
    if x.size < SPECTRAL_SR:  # under ~1s of audio — not enough to judge
        return none
    win, hop = SPECTRAL_WIN, SPECTRAL_HOP
    window = np.hanning(win)
    flats: list[float] = []
    tonal = 0
    for i in range(0, len(x) - win, hop):
        mag = np.abs(np.fft.rfft(x[i:i + win] * window)) + 1e-9
        if mag.sum() < 1e-3:  # silent frame — skip so leading/trailing silence doesn't skew
            continue
        flat = float(np.exp(np.log(mag).mean()) / mag.mean())
        flats.append(flat)
        if flat < FRAME_TONAL_FLATNESS:
            tonal += 1
    if len(flats) < MIN_SPECTRAL_FRAMES:
        # Too little audible audio to judge tonal-ness — abstain (don't flag),
        # but keep the audible-frame count for diagnostics.
        return {"spectral_flatness": None, "tonal_frac": None, "spectral_frames": len(flats)}
    return {
        "spectral_flatness": round(float(np.median(flats)), 4),
        "tonal_frac":        round(tonal / len(flats), 4),
        "spectral_frames":   len(flats),
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
    """Graded points for the tonal-audio (spectral-flatness) primary signal."""
    if flatness is None:
        return 0
    if flatness < FLATNESS_STRONG:
        return 4
    if flatness < FLATNESS_MODERATE:
        return 3
    if flatness < FLATNESS_WEAK:
        return 1
    return 0


def score_metrics(
    metrics: dict[str, Any],
    render_ratio: Optional[float] = None,
) -> tuple[int, bool]:
    """Compute (score, suspicious) from probed metrics + optional render ratio.

    Two PRIMARY axes, each graded and each able to flag on its own:
      * tonal audio (spectral flatness): 0/+1/+3/+4 — the strongest discriminator
        for current data (narrowband synthetic "broken" audio vs broadband
        genuine soundtracks);
      * render time vs cohort: 0/+1/+2/+4.
    Plus two CORROBORATING axes worth at most +1 each — audio-quiet and
    visual-static — each ORing its two correlated sub-signals rather than summing
    them. ``suspicious`` (score >= 3) is reachable via either primary axis;
    corroborating axes alone cap at 2 → borderline, never broken.
    """
    rms  = metrics.get("audio_rms_db")
    peak = metrics.get("audio_peak_db")
    f2l  = metrics.get("phash_first_to_last")
    mdf  = metrics.get("phash_mean_div_from_first")
    flatness = metrics.get("spectral_flatness")

    audio_quiet = (
        (rms  is not None and rms  < RMS_DB_THRESHOLD) or
        (peak is not None and peak < PEAK_DB_THRESHOLD)
    )
    visual_static = (
        (f2l  is not None and f2l  < PHASH_FIRST_TO_LAST_THRESHOLD) or
        (mdf  is not None and mdf  < PHASH_MEAN_DIV_THRESHOLD)
    )

    score = _tonal_points(flatness) + _render_points(render_ratio)
    if audio_quiet:
        score += 1
    if visual_static:
        score += 1
    return score, score >= SUSPICIOUS_THRESHOLD


# ---------- combined per-file probe ----------

def probe_path(source: str | Path) -> dict[str, Any]:
    """Run all probes against a video and return the full metrics dict.

    `source` is a local file path OR a fetchable URL (e.g. a presigned S3/MinIO
    URL for an archive-tiered asset) — ffmpeg reads both, so no local copy is
    needed. Does NOT include `score` / `suspicious` (call `score_metrics`) and
    does NOT touch the database.

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
    out.update(probe_audio(s))
    out.update(probe_phash(s))
    out.update(probe_spectral(s))
    return out


def build_signal_metrics_payload(
    metrics: dict[str, Any],
    render_context: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Wrap a probed metrics dict into the canonical `signal_metrics` shape.

    ``render_context`` (from ``cohort_baselines.render_context_for_asset``)
    supplies the primary render-time signal; when absent the score is
    corroboration-only (borderline at most). Excludes `user_override` — that
    field is only written by the override endpoint and must never be clobbered
    by a re-scan.
    """
    rc = render_context or {}
    render_ratio = rc.get("render_ratio")
    score, suspicious = score_metrics(metrics, render_ratio=render_ratio)
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
        "render_ratio":              render_ratio,
        "cohort_n":                  rc.get("cohort_n"),
        "cohort_p50_sec":            rc.get("cohort_p50_sec"),
        "scanned_at":                datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scanner_version":           SCANNER_VERSION,
    }


# ---------- service: stamp into Asset.media_metadata ----------

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

    async def probe_and_stamp(
        self,
        asset: Asset,
        *,
        force: bool = False,
        commit: bool = True,
        cohort_baselines: Optional[dict[str, Any]] = None,
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

        source = self._resolve_probe_source(asset)
        if source is None:
            logger.debug("signal_analysis_skip_no_source", asset_id=asset.id)
            return None

        try:
            raw = probe_path(source)
        except (FileNotFoundError, RuntimeError, subprocess.TimeoutExpired) as e:
            logger.warning("signal_analysis_probe_failed", asset_id=asset.id, error=str(e))
            return None
        except Exception as e:  # noqa: BLE001 — never let a probe crash ingest
            logger.warning("signal_analysis_probe_unexpected", asset_id=asset.id, error=str(e), exc_info=True)
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

        payload = build_signal_metrics_payload(raw, render_context)

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
    )

    async def rescore_from_stored(
        self,
        asset: Asset,
        *,
        cohort_baselines: Optional[dict[str, Any]] = None,
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
        payload = build_signal_metrics_payload(existing, render_context)
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
