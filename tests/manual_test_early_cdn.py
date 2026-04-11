"""
Manual test: observe Pixverse early-CDN behaviour for a known-filtered prompt.

Usage:
    python tests/manual_test_early_cdn.py

Submits an image-to-video generation that is expected to be content-filtered
by Pixverse, then polls raw status + CDN URLs every few seconds.  Logs the
full timeline so we can see:
  - When the CDN URL first appears
  - Whether it's a real output URL or placeholder
  - When the status transitions to FILTERED
  - Whether the CDN URL gets pulled, redirected, or stays up
  - HTTP response codes on HEAD probes of the CDN URL
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

import httpx
from pixverse import PixverseClient

from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url,
    normalize_url,
)

# ── Test parameters ─────────────────────────────────��────────────────────

EMAIL = "holyfruit30"
PASSWORD = "qwerty11633"

# Toggle which test to run:
TEST_MODE = "normal"  # "flagged" or "normal"

if TEST_MODE == "flagged":
    SOURCE_IMAGE_URL = (
        "https://media.pixverse.ai/openapi/"
        "22b41e80-1002-4905-8817-afeb66bbdcc2_cca85883542dc195891af14f093f74ba_auto.jpg"
    )
    PROMPT = "ACTIONS = SHE DANCES WILDLY, FIGURE 8 STRIPPER STYLE, BACK TO CAMERA"
    MODEL = "v6"
    DURATION = 5
else:
    SOURCE_IMAGE_URL = (
        "https://media.pixverse.ai/pixverse/i2i/ori/"
        "6eac1a42-f0b3-4649-a3db-a13f3ef66b8f.png"
    )
    PROMPT = "They solve puzzle"
    MODEL = "v6"
    DURATION = 1

POLL_INTERVAL_SEC = 2
MAX_POLL_MINUTES = 6


# ── Helpers ──────────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


async def _head_probe(url: str) -> dict:
    """HEAD probe with redirect tracking."""
    if not url or not url.startswith(("http://", "https://")):
        return {"status": None, "final_url": None, "error": "invalid_url"}
    try:
        async with httpx.AsyncClient(
            timeout=6.0,
            follow_redirects=True,
            headers={"User-Agent": "PixSim7-Test/1.0"},
        ) as client:
            r = await client.head(url)
            final_url = str(r.url)
            return {
                "status": r.status_code,
                "final_url": final_url,
                "redirected": final_url != url,
                "final_is_placeholder": is_pixverse_placeholder_url(final_url),
                "final_is_retrievable": has_retrievable_pixverse_media_url(final_url),
            }
    except Exception as e:
        return {"status": None, "final_url": None, "error": str(e)[:120]}


def _url_flags(url: str | None) -> dict:
    if not url:
        return {"url": None}
    normalized = normalize_url(url)
    return {
        "url_preview": (normalized or url)[:120],
        "is_placeholder": is_pixverse_placeholder_url(url),
        "is_retrievable": has_retrievable_pixverse_media_url(url),
    }


# ── Main ─────────────────────────────────────────────────────────────────

async def main():
    print(f"[{_ts()}] Creating client for {EMAIL}...")
    client = PixverseClient(email=EMAIL, password=PASSWORD)
    print(f"[{_ts()}] Logged in. Submitting i2v job...")

    video = await client.create(
        prompt=PROMPT,
        image_url=SOURCE_IMAGE_URL,
        model=MODEL,
        duration=DURATION,
        quality="360p",
        audio=False,
    )
    job_id = str(video.id)
    print(f"[{_ts()}] Submitted — job_id={job_id}")

    start = time.monotonic()
    deadline = start + MAX_POLL_MINUTES * 60
    last_video_url = None
    seen_statuses: list[str] = []
    terminal = False

    while time.monotonic() < deadline:
        await asyncio.sleep(POLL_INTERVAL_SEC)
        elapsed = time.monotonic() - start

        try:
            v = await client.get_video(video_id=job_id)
        except Exception as e:
            print(f"[{_ts()}] +{elapsed:5.1f}s  get_video ERROR: {e}")
            continue

        # Extract raw fields
        raw_status = getattr(v, "video_status", None) or getattr(v, "status", None)
        video_url = getattr(v, "url", None) or getattr(v, "video_url", None)
        thumb_url = getattr(v, "first_frame", None) or getattr(v, "thumbnail", None)

        status_str = str(raw_status)
        if status_str not in seen_statuses:
            seen_statuses.append(status_str)

        # Classify URLs
        vid_flags = _url_flags(video_url)
        thumb_flags = _url_flags(thumb_url)

        print(
            f"[{_ts()}] +{elapsed:5.1f}s  "
            f"raw_status={raw_status}  "
            f"video_url={vid_flags}  "
            f"thumb={thumb_flags}"
        )

        # CDN probe when we have a URL
        if video_url and video_url != last_video_url:
            last_video_url = video_url
            probe = await _head_probe(video_url)
            print(f"[{_ts()}]   CDN HEAD probe: {probe}")

        # Detect terminal status (using raw Pixverse codes)
        if isinstance(raw_status, int):
            if raw_status in (1, 10):  # completed
                print(f"[{_ts()}] === COMPLETED (raw={raw_status}) ===")
                terminal = True
            elif raw_status in (3, 7):  # filtered
                print(f"[{_ts()}] === FILTERED (raw={raw_status}) ===")
                terminal = True
            elif raw_status in (-1, 4, 8, 9):  # failed
                print(f"[{_ts()}] === FAILED (raw={raw_status}) ===")
                terminal = True

        if terminal:
            break

    # Post-terminal: probe CDN every 5s for 60s to see if/when it goes down
    if last_video_url and terminal:
        print(f"\n[{_ts()}] Post-terminal CDN monitoring ({last_video_url[:80]}...)")
        for i in range(12):
            await asyncio.sleep(5)
            probe = await _head_probe(last_video_url)
            elapsed = time.monotonic() - start
            print(f"[{_ts()}] +{elapsed:5.1f}s  CDN probe: {probe}")

    # Summary
    print(f"\n{'='*60}")
    print(f"Job ID:          {job_id}")
    print(f"Status timeline: {' → '.join(seen_statuses)}")
    print(f"Final video URL: {last_video_url}")
    if last_video_url:
        print(f"  is_placeholder:  {is_pixverse_placeholder_url(last_video_url)}")
        print(f"  is_retrievable:  {has_retrievable_pixverse_media_url(last_video_url)}")


if __name__ == "__main__":
    asyncio.run(main())
