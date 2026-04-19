"""Scan video assets for "broken generation" signals (low audio, low visual divergence).

Reads assets from Postgres, runs ffmpeg probes via the SignalAnalysisService
helpers, writes a CSV with per-asset metrics + a heuristic score, and
optionally upserts the metrics into `Asset.media_metadata.signal_metrics`.

This script is a thin batch driver. The probing/scoring/payload-shape logic
lives in `pixsim7.backend.main.services.asset.signal_analysis` and is shared
with the ingest hook and the rescan API endpoint.

Usage:
    python scripts/scan_suspicious_videos.py                         # default: user 1, pixverse
    python scripts/scan_suspicious_videos.py --provider pixverse --user 1 --limit 200
    python scripts/scan_suspicious_videos.py --output review.csv --workers 4
    python scripts/scan_suspicious_videos.py --write                 # upsert into media_metadata.signal_metrics
    python scripts/scan_suspicious_videos.py --write --skip-scanned  # skip already-scanned at current scanner version
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

# Make the `pixsim7` package importable when running as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
import psycopg2.extras

from pixsim7.backend.main.services.asset.signal_analysis import (
    SCANNER_VERSION,
    build_signal_metrics_payload,
    probe_path,
)

DEFAULT_DSN = "host=127.0.0.1 port=5434 dbname=pixsim7 user=pixsim password=pixsim123"
MEDIA_ROOT = Path("G:/code/pixsim7/data/media")  # adjust if relocated

QUERY = """
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
WHERE user_id = %(user_id)s
  AND media_type = 'VIDEO'
  AND provider_id = %(provider)s
  AND is_archived = false
ORDER BY id DESC
LIMIT %(limit)s
"""

# Merge into media_metadata.signal_metrics WITHOUT clobbering an existing
# user_override (set via the override endpoint).
UPSERT_SQL = """
UPDATE assets
SET media_metadata = (
  COALESCE(media_metadata::jsonb, '{}'::jsonb)
  || jsonb_build_object('signal_metrics',
       %s::jsonb
       || COALESCE(
            jsonb_build_object('user_override', media_metadata::jsonb -> 'signal_metrics' ->> 'user_override')
              FILTER (WHERE (media_metadata::jsonb -> 'signal_metrics' ->> 'user_override') IS NOT NULL),
            '{}'::jsonb
          )
     )
)::json
WHERE id = %s
"""


def resolve_path(row: dict) -> Optional[Path]:
    """Try local_path first, fall back to sha256-prefixed convention."""
    if row.get("local_path"):
        p = Path(row["local_path"])
        if not p.is_absolute():
            p = MEDIA_ROOT / p
        if p.exists():
            return p
    sha = row.get("sha256")
    if sha and len(sha) >= 2:
        ext = "mp4"
        if row.get("mime_type"):
            mt = row["mime_type"].split("/")[-1]
            if mt in {"mp4", "webm", "mov"}:
                ext = mt
        p = MEDIA_ROOT / "u" / str(row["user_id"]) / "content" / sha[:2] / f"{sha}.{ext}"
        if p.exists():
            return p
    return None


def probe_asset(row: dict) -> dict:
    """Probe one asset row; return CSV-shaped dict including score + error fields."""
    out = {
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
    path = resolve_path(row)
    if path is None:
        out["error"] = "file_missing"
        return out
    out["file_path"] = str(path)
    try:
        raw = probe_path(path)
    except Exception as e:  # noqa: BLE001 — surface but don't crash batch
        out["error"] = f"probe_failed: {type(e).__name__}: {e}"
        return out
    payload = build_signal_metrics_payload(raw)
    # Hydrate CSV row from the canonical payload.
    for k in (
        "audio_rms_db", "audio_peak_db", "audio_sample_rate", "audio_channels",
        "phash_first_to_last", "phash_mean_div_from_first",
        "score", "suspicious",
    ):
        out[k] = payload.get(k)
    out["duration_sec"] = raw.get("duration_sec")
    out["_payload"] = payload  # used by --write path; stripped before CSV write
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--user", type=int, default=1)
    ap.add_argument("--provider", default="pixverse")
    ap.add_argument("--limit", type=int, default=500)
    ap.add_argument("--output", default="suspicious-videos.csv")
    ap.add_argument("--workers", type=int, default=4, help="ffmpeg jobs in parallel")
    ap.add_argument("--dsn", default=DEFAULT_DSN)
    ap.add_argument("--write", action="store_true",
                    help="Upsert metrics into assets.media_metadata.signal_metrics")
    ap.add_argument("--skip-scanned", action="store_true",
                    help="With --write: skip assets whose stored scanner_version matches current")
    args = ap.parse_args()

    print(f"[scan] connecting to DB...", file=sys.stderr)
    with psycopg2.connect(args.dsn) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(QUERY, {"user_id": args.user, "provider": args.provider, "limit": args.limit})
            rows = cur.fetchall()
    if args.skip_scanned and args.write:
        before = len(rows)
        rows = [r for r in rows if r.get("prev_scanner_version") != SCANNER_VERSION]
        print(f"[scan] {len(rows)}/{before} videos to scan (skipped already-scanned at {SCANNER_VERSION})",
              file=sys.stderr)
    else:
        print(f"[scan] {len(rows)} {args.provider} videos for user {args.user}", file=sys.stderr)
    if not rows:
        return 0

    fieldnames = [
        "asset_id", "sha256", "source_generation_id", "model",
        "duration_sec", "file_size_mb",
        "provider_flagged_reason", "video_original_status",
        "audio_rms_db", "audio_peak_db", "audio_sample_rate", "audio_channels",
        "phash_first_to_last", "phash_mean_div_from_first",
        "score", "suspicious", "file_path", "error",
    ]
    out_path = Path(args.output)
    t0 = time.time()
    done = 0
    suspicious_count = 0
    errors = 0
    written = 0

    write_conn = psycopg2.connect(args.dsn) if args.write else None
    write_cur = write_conn.cursor() if write_conn else None
    write_buffer: list[tuple[str, int]] = []

    def flush_writes():
        nonlocal written
        if not write_buffer or write_cur is None or write_conn is None:
            return
        write_cur.executemany(UPSERT_SQL, write_buffer)
        write_conn.commit()
        written += len(write_buffer)
        write_buffer.clear()

    try:
        with out_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            with ThreadPoolExecutor(max_workers=args.workers) as ex:
                futures = {ex.submit(probe_asset, row): row["id"] for row in rows}
                for fut in as_completed(futures):
                    res = fut.result()
                    payload = res.pop("_payload", None)
                    writer.writerow(res)
                    done += 1
                    if res.get("suspicious"):
                        suspicious_count += 1
                    if res.get("error"):
                        errors += 1
                    elif args.write and payload is not None:
                        write_buffer.append((json.dumps(payload), res["asset_id"]))
                        if len(write_buffer) >= 50:
                            flush_writes()
                    if done % 10 == 0 or done == len(rows):
                        elapsed = time.time() - t0
                        rate = done / elapsed if elapsed else 0
                        eta = (len(rows) - done) / rate if rate else 0
                        print(f"[scan] {done}/{len(rows)}  suspicious={suspicious_count}  errors={errors}  "
                              f"written={written + len(write_buffer)}  rate={rate:.1f}/s  eta={eta:.0f}s",
                              file=sys.stderr)
            flush_writes()
    finally:
        if write_cur is not None:
            write_cur.close()
        if write_conn is not None:
            write_conn.close()

    print(f"[scan] done -> {out_path}  "
          f"({suspicious_count} suspicious / {errors} errors / {done} total"
          f"{f' / {written} written to DB' if args.write else ''})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
