"""Backfill provider_submissions.response['thumbnail_url'] for Pixverse videos.

Terminology
-----------
Despite the field being named ``thumbnail_url``, for Pixverse video
submissions it stores the **LAST-FRAME URL** (resolved from Pixverse's
``customer_video_last_frame_url`` / ``last_frame`` fields).  The field
is named ``thumbnail_url`` as a legacy of the SDK's ``Video.thumbnail``
attribute, which for video responses resolves to the last rendered
frame.  "Candidates missing thumbnail_url" in the script output below
means "Pixverse videos where we don't have the last-frame URL cached".

Background
----------
Two bugs caused every Pixverse video submission to stash None for
``thumbnail_url`` (both fixed 2026-04):

  1. ``pixverse_status.py`` set ``suppress_thumbnail=True`` unconditionally,
     nuking the extracted URL before it reached the submission response.
  2. The field-name lookup missed ``last_frame`` /
     ``customer_video_last_frame_url``, falling through to ``first_frame``
     (semantically wrong for extend-seed use).

A field-name bug in pixverse_status.py (fixed 2026-04) caused every Pixverse
video submission to stash None for ``thumbnail_url`` — the rendered last-frame
URL that ``VIDEO_EXTEND`` seeds from via ``customer_video_last_frame_url``.
Result: every extend off a pre-fix video forces Pixverse to re-derive the
last frame server-side (blurry).  This script calls ``get_video`` on Pixverse
for each stale submission, extracts the thumbnail the SDK now correctly
surfaces, and writes it to both the submission response AND the source
asset's ``media_metadata['provider_thumbnail_url']``.

Idempotent: skips any submission that already has a non-empty thumbnail_url.

Usage::

    python tools/backfill_pixverse_thumbnails.py --count-only
    python tools/backfill_pixverse_thumbnails.py --dry-run [--limit N]
    python tools/backfill_pixverse_thumbnails.py --apply [--limit N]

Recommended sequence:
  1. ``--count-only``                   – see the scope, no API calls.
  2. ``--dry-run --limit 10``           – sample 10 records, confirm URLs look right.
  3. ``--apply``                        – commit writes for all candidates.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any, Optional

# Allow running as a plain script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

_VIDEO_OPS = ("text_to_video", "image_to_video", "video_extend", "fusion")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill Pixverse thumbnail_url in submission responses.",
    )
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--count-only",
        action="store_true",
        help="Print candidate count. No API calls, no writes.",
    )
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Call get_video on each candidate and print findings, but DO NOT write.",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Call get_video and write the thumbnail URL to the submission and asset.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum candidates to process in this run (most-recent-first).",
    )
    return p.parse_args()


async def _fetch_candidates(session, limit: Optional[int]):
    from pixsim7.backend.main.domain import Generation
    from pixsim7.backend.main.domain.providers import ProviderSubmission

    q = (
        select(
            ProviderSubmission.id.label("sub_id"),
            ProviderSubmission.account_id,
            ProviderSubmission.provider_job_id,
            ProviderSubmission.response,
            ProviderSubmission.generation_id,
            Generation.asset_id,
            Generation.operation_type,
        )
        .join(Generation, ProviderSubmission.generation_id == Generation.id)
        .where(ProviderSubmission.provider_id == "pixverse")
        .where(ProviderSubmission.status == "success")
        .where(ProviderSubmission.provider_job_id.isnot(None))
        .where(Generation.operation_type.in_(_VIDEO_OPS))
        .order_by(ProviderSubmission.id.desc())
    )
    rows = (await session.execute(q)).all()

    candidates = []
    for row in rows:
        resp = row.response or {}
        if isinstance(resp, dict) and resp.get("thumbnail_url"):
            continue
        candidates.append(row)
        if limit and len(candidates) >= limit:
            break
    return candidates


async def _fetch_video_thumbnail(client: Any, video_id: str) -> Optional[str]:
    """Call ``client.get_video(video_id)`` and return the last-frame URL, or None.

    Pixverse surfaces ``customer_video_last_frame_url`` (and raw
    ``last_frame``) as ``Video.thumbnail`` (SDK naming — it IS the last
    rendered frame for video results).  Placeholder URLs (e.g. the
    ``/pixverse/jpg/media/default.jpg`` that filtered videos return) are
    explicitly rejected — stamping them into asset.media_metadata would
    signal "real last frame available" when none exists.
    """
    from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
        is_pixverse_placeholder_url,
    )
    try:
        video = await client.get_video(video_id=video_id)
    except Exception as e:
        return f"__error__:{e.__class__.__name__}:{e}"
    thumb = getattr(video, "thumbnail", None)
    if not isinstance(thumb, str) or not thumb.startswith(("http://", "https://")):
        return None
    if is_pixverse_placeholder_url(thumb):
        # Filtered videos return /default.jpg — not a real last frame.
        return None
    return thumb


async def _apply_to_row(
    session,
    sub_id: int,
    asset_id: Optional[int],
    new_thumb: str,
) -> None:
    """Write thumbnail_url onto the submission and the source asset."""
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.domain.providers import ProviderSubmission

    sub = (
        await session.execute(
            select(ProviderSubmission).where(ProviderSubmission.id == sub_id)
        )
    ).scalar_one()

    new_response = dict(sub.response or {})
    new_response["thumbnail_url"] = new_thumb
    sub.response = new_response
    flag_modified(sub, "response")

    if asset_id is not None:
        asset = await session.get(Asset, asset_id)
        if asset is not None:
            meta = dict(asset.media_metadata or {})
            # Preserve an existing provider_thumbnail_url if already set;
            # backfill only fills in the gap.
            if not meta.get("provider_thumbnail_url"):
                meta["provider_thumbnail_url"] = new_thumb
                asset.media_metadata = meta
                flag_modified(asset, "media_metadata")


async def main() -> None:
    args = parse_args()

    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.domain.providers import ProviderAccount
    from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider

    async with get_async_session() as session:
        candidates = await _fetch_candidates(session, limit=None)
        total = len(candidates)
        print(
            f"Candidates: {total} Pixverse video submissions missing the "
            f"last-frame URL (stored as response['thumbnail_url'])."
        )
        if total == 0:
            return

        if args.count_only:
            return

        if args.limit and args.limit < total:
            candidates = candidates[: args.limit]
            print(f"Processing first {args.limit} (most-recent-first).")

        provider = PixverseProvider()
        client_cache: dict[int, Any] = {}
        account_cache: dict[int, Any] = {}
        results = {
            "found_url": 0,
            "written": 0,
            "no_thumbnail": 0,
            "error": 0,
        }

        for i, cand in enumerate(candidates, 1):
            try:
                account = account_cache.get(cand.account_id)
                if account is None:
                    account = await session.get(ProviderAccount, cand.account_id)
                    if account is None:
                        print(f"  [{i}/{len(candidates)}] sub {cand.sub_id}: account {cand.account_id} not found — skip")
                        results["error"] += 1
                        continue
                    account_cache[cand.account_id] = account

                client = client_cache.get(cand.account_id)
                if client is None:
                    client = provider._create_client(account)
                    client_cache[cand.account_id] = client

                thumb = await _fetch_video_thumbnail(client, str(cand.provider_job_id))

                if isinstance(thumb, str) and thumb.startswith("__error__:"):
                    print(f"  [{i}/{len(candidates)}] sub {cand.sub_id} (job {cand.provider_job_id}): {thumb[len('__error__:'):]}")
                    results["error"] += 1
                    continue

                if not thumb:
                    print(f"  [{i}/{len(candidates)}] sub {cand.sub_id} (job {cand.provider_job_id}): no thumbnail on Pixverse side")
                    results["no_thumbnail"] += 1
                    continue

                results["found_url"] += 1
                print(f"  [{i}/{len(candidates)}] sub {cand.sub_id} (job {cand.provider_job_id}) asset {cand.asset_id}: {thumb[:100]}")

                if args.dry_run:
                    continue

                await _apply_to_row(session, cand.sub_id, cand.asset_id, thumb)
                await session.commit()
                results["written"] += 1

            except Exception as e:
                await session.rollback()
                print(f"  [{i}/{len(candidates)}] sub {cand.sub_id}: unexpected {e.__class__.__name__}: {e}")
                results["error"] += 1

        print()
        print("--- Summary ---")
        for k, v in results.items():
            print(f"  {k}: {v}")
        if args.dry_run:
            print("\nDry run: no DB writes committed.  Re-run with --apply to persist.")


if __name__ == "__main__":
    asyncio.run(main())
