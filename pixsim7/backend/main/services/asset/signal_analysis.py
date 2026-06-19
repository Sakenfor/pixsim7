"""Signal-based broken-video heuristic.

Probes a video file's audio and visual characteristics with ffmpeg and
combines them with the generation's *cohort-relative render time* to score
how likely a clip is a degenerate generation (e.g. a fast-failed output where
the model bailed early / returned a canned rejection clip).

Scoring model (v2 — render-primary, conservative). See plan
``signal-scan-recalibration`` for the live-data validation behind it:

  * PRIMARY — render ratio vs cohort median (``render_ratio``, supplied by
    the caller from cohort_baselines): < 0.5 strong (+4), < 0.7 moderate
    (+2), < 0.85 weak (+1). This is the strongest single discriminator;
    genuine fast-fails render ~0.8x cohort median and below.
  * CORROBORATING ONLY — audio-quiet (rms OR peak below threshold) and
    visual-static (first-to-last OR mean-div below threshold), each +1. The
    two sub-signals per axis are collapsed with OR because they are highly
    correlated (double-counting them was the v1 bug). Modern "failed"
    generations often still animate, so a single axis alone is never enough
    to flag "broken" — without a render signal the score caps at borderline.

``suspicious`` (broken) requires score >= SUSPICIOUS_THRESHOLD (3), reachable
only via a render signal: render-strong alone, or render-moderate + >=1
corroborating axis. Audio/visual without a trusted cohort baseline top out at
2 → borderline, never broken.

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
SCANNER_VERSION = "v2"

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

# Probe budget: ffmpeg should be sub-second per clip. Generous timeout to
# absorb cold-cache or contention; if exceeded, treat as probe failure.
PROBE_TIMEOUT_SEC = 60


# ---------- ffmpeg/ffprobe primitives ----------

def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(cmd: list[str], timeout: int = PROBE_TIMEOUT_SEC) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=False, timeout=timeout)


def probe_audio(path: Path) -> dict[str, Optional[float]]:
    """Extract overall audio RMS / peak via volumedetect."""
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", str(path),
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


def probe_streams(path: Path) -> dict[str, Optional[float]]:
    """Sample-rate / channels / duration via ffprobe one-shot."""
    r = _run([
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_type,sample_rate,channels:format=duration",
        "-of", "default=nw=1", str(path),
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


def probe_phash(path: Path, fps: int = 4) -> dict[str, Optional[float]]:
    """Decode at low fps/res to grayscale, dhash each frame, return divergence stats.

    Cheap (~1s per 15s clip): ffmpeg drops to 9x8 grayscale at 4fps and writes
    raw bytes to stdout.
    """
    r = _run([
        "ffmpeg", "-hide_banner", "-nostats",
        "-i", str(path),
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


# ---------- scoring ----------

def _render_points(render_ratio: Optional[float]) -> int:
    """Graded points for the primary cohort-relative render-time signal."""
    if render_ratio is None:
        return 0
    if render_ratio < RENDER_RATIO_STRONG:
        return 4
    if render_ratio < RENDER_RATIO_MODERATE:
        return 2
    if render_ratio < RENDER_RATIO_WEAK:
        return 1
    return 0


def score_metrics(
    metrics: dict[str, Any],
    render_ratio: Optional[float] = None,
) -> tuple[int, bool]:
    """Compute (score, suspicious) from probed metrics + optional render ratio.

    Render time is the primary signal (graded 0/+1/+2/+4). Audio-quiet and
    visual-static are corroborating axes worth at most +1 each — each axis ORs
    its two correlated sub-signals rather than summing them. ``suspicious`` is
    only reachable with a render signal (axes alone cap at 2 → borderline).
    """
    rms  = metrics.get("audio_rms_db")
    peak = metrics.get("audio_peak_db")
    f2l  = metrics.get("phash_first_to_last")
    mdf  = metrics.get("phash_mean_div_from_first")

    audio_quiet = (
        (rms  is not None and rms  < RMS_DB_THRESHOLD) or
        (peak is not None and peak < PEAK_DB_THRESHOLD)
    )
    visual_static = (
        (f2l  is not None and f2l  < PHASH_FIRST_TO_LAST_THRESHOLD) or
        (mdf  is not None and mdf  < PHASH_MEAN_DIV_THRESHOLD)
    )

    score = _render_points(render_ratio)
    if audio_quiet:
        score += 1
    if visual_static:
        score += 1
    return score, score >= SUSPICIOUS_THRESHOLD


# ---------- combined per-file probe ----------

def probe_path(path: Path) -> dict[str, Any]:
    """Run all probes against a video file and return the full metrics dict.

    Does NOT include `score` / `suspicious` (call `score_metrics` for that)
    and does NOT touch the database.

    Raises:
        FileNotFoundError: if path doesn't exist
        RuntimeError: if ffmpeg/ffprobe are not available
        subprocess.TimeoutExpired: if a probe takes longer than PROBE_TIMEOUT_SEC
    """
    if not path.exists():
        raise FileNotFoundError(str(path))
    if not _ffmpeg_available():
        raise RuntimeError("ffmpeg/ffprobe not available in PATH")
    out: dict[str, Any] = {}
    out.update(probe_streams(path))
    out.update(probe_audio(path))
    out.update(probe_phash(path))
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
        """Only stamp video assets with a local file path resolved."""
        media_type = getattr(asset, "media_type", None)
        media_type_str = getattr(media_type, "value", media_type)
        return str(media_type_str).lower() == "video" and bool(asset.local_path)

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

        path = Path(asset.local_path) if asset.local_path else None
        if path is None or not path.exists():
            logger.debug("signal_analysis_skip_missing_file", asset_id=asset.id, path=str(path))
            return None

        try:
            raw = probe_path(path)
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
