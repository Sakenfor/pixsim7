"""Signal-based broken-video heuristic.

Probes a video file's audio and visual characteristics with ffmpeg, then
scores how likely it is to be a degenerate generation (e.g. a pixverse
safety-filtered output that returned a near-silent / wobble-and-return clip).

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
      "scanned_at": ISO timestamp,
      "scanner_version": str,
      "user_override": "clean" | "broken" | <unset>  # set by override endpoint, never written here
    }

Calibration: thresholds tuned on a 4-clip sample (see
docs / pixverse-broken-video-detection.md). Re-tune after sampling the real
distribution; bump SCANNER_VERSION when scoring changes so callers can
detect stale entries.
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
SCANNER_VERSION = "v1"

# Calibration thresholds (see calibration sample in module docstring).
RMS_DB_THRESHOLD = -28.0           # below this → +2 score
PEAK_DB_THRESHOLD = -10.0          # below this → +1 score
PHASH_FIRST_TO_LAST_THRESHOLD = 20  # below this → +2 score
PHASH_MEAN_DIV_THRESHOLD = 22.0    # below this → +1 score
SUSPICIOUS_THRESHOLD = 3            # score >= this is flagged

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

def score_metrics(metrics: dict[str, Any]) -> tuple[int, bool]:
    """Compute (score, suspicious) from a probed metrics dict."""
    score = 0
    rms  = metrics.get("audio_rms_db")
    peak = metrics.get("audio_peak_db")
    f2l  = metrics.get("phash_first_to_last")
    mdf  = metrics.get("phash_mean_div_from_first")
    if rms  is not None and rms  < RMS_DB_THRESHOLD:           score += 2
    if peak is not None and peak < PEAK_DB_THRESHOLD:          score += 1
    if f2l  is not None and f2l  < PHASH_FIRST_TO_LAST_THRESHOLD: score += 2
    if mdf  is not None and mdf  < PHASH_MEAN_DIV_THRESHOLD:   score += 1
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


def build_signal_metrics_payload(metrics: dict[str, Any]) -> dict[str, Any]:
    """Wrap a probed metrics dict into the canonical `signal_metrics` shape.

    Excludes `user_override` — that field is only written by the override
    endpoint and must never be clobbered by a re-scan.
    """
    score, suspicious = score_metrics(metrics)
    return {
        "score":                     score,
        "suspicious":                suspicious,
        "audio_rms_db":              metrics.get("audio_rms_db"),
        "audio_peak_db":             metrics.get("audio_peak_db"),
        "audio_sample_rate":         metrics.get("audio_sample_rate"),
        "audio_channels":            metrics.get("audio_channels"),
        "phash_first_to_last":       metrics.get("phash_first_to_last"),
        "phash_mean_div_from_first": metrics.get("phash_mean_div_from_first"),
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
    ) -> Optional[dict[str, Any]]:
        """Probe `asset` and stamp signal_metrics on it.

        Args:
            asset: an Asset row already loaded in the session.
            force: re-scan even if scanner_version matches the current version.
            commit: commit the session after stamping. Set False when the caller
                runs inside a larger transaction.

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

        payload = build_signal_metrics_payload(raw)

        # Merge into media_metadata, preserving an existing user_override.
        meta = dict(asset.media_metadata or {})
        prev = dict(meta.get("signal_metrics") or {})
        if "user_override" in prev:
            payload["user_override"] = prev["user_override"]
        meta["signal_metrics"] = payload
        asset.media_metadata = meta  # reassignment triggers SQLAlchemy SET on JSON column

        self.db.add(asset)
        if commit:
            await self.db.commit()
        return payload
