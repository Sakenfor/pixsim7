"""Scan-suspicious-videos diagnostic.

Backend port of ``scripts/scan_suspicious_videos.py``.  Same probing /
scoring logic (delegates to ``services.asset.signal_analysis``); the
diagnostic shape just trades the script's monolithic stderr progress +
CSV output for a typed event stream.

Phases
    discovering   →  fetching candidate rows
    scanning      →  per-asset ffmpeg probes (workers concurrent)
    done

Per-asset events (``observation``) carry the same fields the CSV row
does, so a downstream replay can reconstruct the report.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, AsyncIterator, Optional

from sqlalchemy import text

from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.main.services.asset.signal_analysis import (
    SCANNER_VERSION,
    build_signal_metrics_payload,
    probe_path,
)
from pixsim7.backend.main.shared.path_registry import get_path_registry

from .base import Diagnostic, DiagnosticEvent, DiagnosticParam, DiagnosticSpec

logger = logging.getLogger(__name__)


# ── SQL — kept identical in shape to the script, with named bindings ────


_QUERY = """
SELECT
    id,
    user_id,
    sha256,
    file_size_bytes,
    mime_type,
    model,
    source_generation_id,
    local_path,
    media_metadata->>'video_original_status'                  AS video_original_status,
    media_metadata->>'provider_flagged_reason'                AS provider_flagged_reason,
    media_metadata->'signal_metrics'->>'scanner_version'      AS prev_scanner_version
FROM assets
WHERE user_id = :user_id
  AND media_type = 'VIDEO'
  AND provider_id = :provider
  AND is_archived = false
ORDER BY id DESC
LIMIT :limit
"""


# Merge into media_metadata.signal_metrics WITHOUT clobbering an existing
# user_override (set via the override endpoint) — same shape as the
# script's UPSERT_SQL but with named binds for SQLAlchemy's ``text()``.
_UPSERT_SQL = """
UPDATE assets
SET media_metadata = (
  COALESCE(media_metadata::jsonb, '{}'::jsonb)
  || jsonb_build_object('signal_metrics',
       (:payload)::jsonb
       || COALESCE(
            jsonb_build_object('user_override', media_metadata::jsonb -> 'signal_metrics' ->> 'user_override')
              FILTER (WHERE (media_metadata::jsonb -> 'signal_metrics' ->> 'user_override') IS NOT NULL),
            '{}'::jsonb
          )
     )
)::json
WHERE id = :asset_id
"""


# ── Helpers (small, self-contained) ─────────────────────────────────────


def _resolve_path(row: dict[str, Any]) -> Optional[Path]:
    """Try local_path first, fall back to sha256-prefixed convention.

    Mirrors ``scripts.scan_suspicious_videos.resolve_path`` but resolves
    media root from the runtime ``path_registry`` so it works in any env.
    """
    media_root = Path(get_path_registry().media_root)
    local = row.get("local_path")
    if local:
        p = Path(local)
        if not p.is_absolute():
            p = media_root / p
        if p.exists():
            return p
    sha = row.get("sha256")
    if sha and len(sha) >= 2:
        ext = "mp4"
        mime = row.get("mime_type")
        if mime:
            mt = mime.split("/")[-1]
            if mt in {"mp4", "webm", "mov"}:
                ext = mt
        p = media_root / "u" / str(row["user_id"]) / "content" / sha[:2] / f"{sha}.{ext}"
        if p.exists():
            return p
    return None


def _probe_asset_sync(row: dict[str, Any]) -> dict[str, Any]:
    """Synchronous per-asset probe — runs in a worker thread.

    Returns a dict shaped like the CSV row, plus a ``_payload`` field
    containing the canonical signal_metrics dict for the optional DB
    upsert path.  The caller pops ``_payload`` before emitting an event.
    """
    out: dict[str, Any] = {
        "asset_id":                row["id"],
        "sha256":                  (row.get("sha256") or "")[:16],
        "source_generation_id":    row.get("source_generation_id"),
        "model":                   row.get("model"),
        "duration_sec":            None,
        "file_size_mb":            round((row.get("file_size_bytes") or 0) / 1_000_000, 2),
        "provider_flagged_reason": row.get("provider_flagged_reason") or "",
        "video_original_status":   row.get("video_original_status") or "",
        "audio_rms_db":            None,
        "audio_peak_db":           None,
        "audio_sample_rate":       None,
        "audio_channels":          None,
        "phash_first_to_last":     None,
        "phash_mean_div_from_first": None,
        "score":                   None,
        "suspicious":              False,
        "file_path":               "",
        "error":                   "",
    }
    path = _resolve_path(row)
    if path is None:
        out["error"] = "file_missing"
        return out
    out["file_path"] = str(path)
    try:
        raw = probe_path(path)
    except Exception as exc:  # noqa: BLE001 — surface but never crash batch
        out["error"] = f"probe_failed: {type(exc).__name__}: {exc}"
        return out
    payload = build_signal_metrics_payload(raw)
    for k in (
        "audio_rms_db", "audio_peak_db", "audio_sample_rate", "audio_channels",
        "phash_first_to_last", "phash_mean_div_from_first",
        "score", "suspicious",
    ):
        out[k] = payload.get(k)
    out["duration_sec"] = raw.get("duration_sec")
    out["_payload"] = payload
    return out


# ── Diagnostic ──────────────────────────────────────────────────────────


class ScanSuspiciousVideosDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="scan-suspicious-videos",
        label="Scan suspicious videos",
        description=(
            "Scan video assets for broken-generation signals (low audio RMS, "
            "low visual divergence) using ffmpeg.  Same probes as the ingest "
            "scanner — see services/asset/signal_analysis.py.  Optionally "
            "upserts metrics into asset.media_metadata.signal_metrics."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="user_id",
                kind="int",
                label="User ID",
                default=1,
                description="Owner of the assets to scan.",
                required=True,
            ),
            DiagnosticParam(
                name="provider",
                kind="string",
                label="Provider",
                default="pixverse",
                description="provider_id filter — 'pixverse', 'remaker', etc.",
            ),
            DiagnosticParam(
                name="limit",
                kind="int",
                label="Max assets",
                default=200,
                description="Hard cap on rows fetched. Increase for full scans.",
            ),
            DiagnosticParam(
                name="workers",
                kind="int",
                label="Parallel ffmpeg jobs",
                default=4,
                description="Concurrent ffmpeg probes. 1–16 recommended.",
            ),
            DiagnosticParam(
                name="write",
                kind="bool",
                label="Upsert into media_metadata.signal_metrics",
                default=False,
                description=(
                    "When on, persists per-asset metrics to the asset's "
                    "media_metadata.signal_metrics field (preserves any "
                    "existing user_override)."
                ),
            ),
            DiagnosticParam(
                name="skip_scanned",
                kind="bool",
                label="Skip already-scanned (current scanner version)",
                default=False,
                description=(
                    "With 'write' on: skip assets whose stored "
                    "scanner_version matches the current code."
                ),
            ),
        ),
    )

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        user_id = int(params.get("user_id") or 1)
        provider = str(params.get("provider") or "pixverse")
        limit = max(1, min(5000, int(params.get("limit") or 200)))
        workers = max(1, min(16, int(params.get("workers") or 4)))
        do_write = bool(params.get("write"))
        skip_scanned = bool(params.get("skip_scanned"))

        loop = asyncio.get_event_loop()
        t0 = loop.time()

        def now() -> float:
            return loop.time() - t0

        # ── Phase: discovering ─────────────────────────────────────────
        yield DiagnosticEvent(now(), "phase", {"phase": "discovering"})
        yield DiagnosticEvent(
            now(),
            "log",
            {
                "level": "info",
                "message": (
                    f"Querying assets: user_id={user_id} provider={provider} "
                    f"limit={limit}"
                    + (" skip_scanned=true" if skip_scanned and do_write else "")
                ),
            },
        )

        try:
            rows = await self._fetch_candidates(user_id, provider, limit)
        except Exception as exc:
            yield DiagnosticEvent(
                now(),
                "error",
                {"message": f"DB query failed: {type(exc).__name__}: {exc}"},
            )
            return

        if cancel_event.is_set():
            return

        before = len(rows)
        if skip_scanned and do_write:
            rows = [r for r in rows if r.get("prev_scanner_version") != SCANNER_VERSION]
            yield DiagnosticEvent(
                now(),
                "log",
                {
                    "level": "info",
                    "message": (
                        f"{len(rows)}/{before} videos to scan "
                        f"(skipped already-scanned at {SCANNER_VERSION})"
                    ),
                },
            )
        else:
            yield DiagnosticEvent(
                now(),
                "log",
                {"level": "info", "message": f"{len(rows)} candidates"},
            )

        yield DiagnosticEvent(
            now(),
            "transition",
            {"key": "t_candidates_loaded", "value": now()},
        )

        if not rows:
            yield DiagnosticEvent(
                now(),
                "summary",
                {
                    "total_candidates": before,
                    "scanned": 0,
                    "suspicious": 0,
                    "errors": 0,
                    "written": 0,
                    "scanner_version": SCANNER_VERSION,
                },
            )
            return

        # ── Phase: scanning ────────────────────────────────────────────
        yield DiagnosticEvent(now(), "phase", {"phase": "scanning"})

        sem = asyncio.Semaphore(workers)
        suspicious_count = 0
        error_count = 0
        written_total = 0
        write_buffer: list[tuple[str, int]] = []
        first_suspicious_emitted = False
        first_error_emitted = False

        async def probe_one(row: dict[str, Any]) -> Optional[dict[str, Any]]:
            async with sem:
                if cancel_event.is_set():
                    return None
                return await asyncio.to_thread(_probe_asset_sync, row)

        tasks = [asyncio.create_task(probe_one(row)) for row in rows]
        done = 0
        try:
            for fut in asyncio.as_completed(tasks):
                res = await fut
                if cancel_event.is_set():
                    break
                if res is None:
                    continue
                done += 1
                payload = res.pop("_payload", None)

                # Per-asset observation — mirrors CSV row shape.
                yield DiagnosticEvent(
                    now(),
                    "observation",
                    {
                        "source": "ffmpeg_probe",
                        "asset_id": res["asset_id"],
                        "sha256": res["sha256"],
                        "model": res.get("model"),
                        "duration_sec": res.get("duration_sec"),
                        "file_size_mb": res.get("file_size_mb"),
                        "audio_rms_db": res.get("audio_rms_db"),
                        "audio_peak_db": res.get("audio_peak_db"),
                        "phash_first_to_last": res.get("phash_first_to_last"),
                        "phash_mean_div_from_first": res.get("phash_mean_div_from_first"),
                        "score": res.get("score"),
                        "suspicious": res.get("suspicious"),
                        "video_original_status": res.get("video_original_status") or None,
                        "provider_flagged_reason": res.get("provider_flagged_reason") or None,
                        "error": res.get("error") or None,
                    },
                )

                if res.get("suspicious"):
                    suspicious_count += 1
                    if not first_suspicious_emitted:
                        first_suspicious_emitted = True
                        yield DiagnosticEvent(
                            now(),
                            "transition",
                            {"key": "t_first_suspicious", "value": now()},
                        )
                if res.get("error"):
                    error_count += 1
                    if not first_error_emitted:
                        first_error_emitted = True
                        yield DiagnosticEvent(
                            now(),
                            "transition",
                            {"key": "t_first_error", "value": now()},
                        )
                elif do_write and payload is not None:
                    write_buffer.append((json.dumps(payload), int(res["asset_id"])))
                    if len(write_buffer) >= 50:
                        flushed = await self._flush_writes(write_buffer)
                        write_buffer = []
                        written_total += flushed

                # Periodic progress log — same cadence as the script (every 10).
                if done % 10 == 0 or done == len(rows):
                    elapsed = now()
                    rate = done / elapsed if elapsed else 0
                    eta = (len(rows) - done) / rate if rate else 0
                    yield DiagnosticEvent(
                        now(),
                        "log",
                        {
                            "level": "info",
                            "message": (
                                f"{done}/{len(rows)}  suspicious={suspicious_count}  "
                                f"errors={error_count}  rate={rate:.1f}/s  eta={eta:.0f}s"
                                + (f"  written={written_total + len(write_buffer)}" if do_write else "")
                            ),
                        },
                    )
        finally:
            # If we broke early (cancel), cancel any still-pending tasks.
            for t in tasks:
                if not t.done():
                    t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        # Final flush.
        if do_write and write_buffer:
            flushed = await self._flush_writes(write_buffer)
            written_total += flushed
            yield DiagnosticEvent(
                now(),
                "log",
                {
                    "level": "info",
                    "message": f"Flushed final batch — {flushed} rows",
                },
            )

        # ── Phase: done + summary ──────────────────────────────────────
        yield DiagnosticEvent(now(), "transition", {"key": "t_scan_complete", "value": now()})
        yield DiagnosticEvent(now(), "phase", {"phase": "done"})
        yield DiagnosticEvent(
            now(),
            "summary",
            {
                "total_candidates": before,
                "scanned": done,
                "suspicious": suspicious_count,
                "errors": error_count,
                "written": written_total,
                "scanner_version": SCANNER_VERSION,
                "params": {
                    "user_id": user_id,
                    "provider": provider,
                    "limit": limit,
                    "workers": workers,
                    "write": do_write,
                    "skip_scanned": skip_scanned,
                },
            },
        )

    # ── DB helpers ──────────────────────────────────────────────────────

    async def _fetch_candidates(
        self,
        user_id: int,
        provider: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        async with get_async_session() as session:
            result = await session.execute(
                text(_QUERY),
                {"user_id": user_id, "provider": provider, "limit": limit},
            )
            return [dict(row) for row in result.mappings()]

    async def _flush_writes(self, write_buffer: list[tuple[str, int]]) -> int:
        if not write_buffer:
            return 0
        async with get_async_session() as session:
            for payload_json, asset_id in write_buffer:
                await session.execute(
                    text(_UPSERT_SQL),
                    {"payload": payload_json, "asset_id": asset_id},
                )
            await session.commit()
        return len(write_buffer)
