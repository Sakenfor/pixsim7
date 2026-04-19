"""
Manual test: measure Pixverse's early-CDN window for a known-filtered prompt.

Usage:
    python tests/manual_test_early_cdn.py

Submits an image-to-video generation expected to trip Pixverse moderation,
then polls ``get_video`` AND ``list_videos`` every 250 ms and HEAD-probes the
real CDN URL every 500 ms on a parallel task.  Records a transition timeline
and prints:

  - t_submit     → submit response received
  - t_first_real → first poll that saw a retrievable /openapi/output/ URL
  - t_placeholder → first poll that saw the /default.mp4 template
  - t_404        → first HEAD probe on the real URL that failed
  - window       = t_placeholder − t_first_real  (how long we had to catch it)
  - cdn_lifespan = t_404 − t_first_real          (how long the file stayed up)

The two numbers are the ones that matter for the polling cadence decision.
If the window is sub-2s, production polling (every 2s) can miss it; a faster
poll or a parallel list_videos query widens the capture odds.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Allow running as a plain script from the repo root:
#   python tests/manual_test_early_cdn.py
# The repo isn't pip-installed, so add its root to sys.path so the
# `pixsim7` package resolves.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import httpx
from pixverse import PixverseClient

from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url,
    normalize_url,
)

# ── Test parameters ──────────────────────────────────────────────────────

# Account selection, in priority order:
#   1. argv[1] — either ``account:<id>`` (DB lookup) or ``email:password``.
#   2. ``PIXVERSE_WEBAPI_ACCOUNT_ID`` env (numeric, DB lookup).
#   3. ``PIXVERSE_WEBAPI_EMAIL`` + ``PIXVERSE_WEBAPI_PASSWORD`` env.
#   4. Hardcoded fallback (legacy default).
DEFAULT_EMAIL = "holyfruit30"
DEFAULT_PASSWORD = "qwerty11633"


def _resolve_webapi_creds() -> tuple[str, Optional[str], Optional[str]]:
    """Return (label, email, password) or (label, email, None) when using a
    stored session from the pixsim7 DB (JWT auth, no password needed).

    The account is resolved lazily in ``main`` for DB lookups (can't open a
    session at import time).
    """
    # argv[1] can be ``account:<id>`` sentinel or ``email:password`` pair.
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        raw = sys.argv[1].strip()
        if raw.startswith("account:"):
            inner = raw.split(":", 1)[1].strip()
            if inner.isdigit():
                return (f"account:{inner}", "__resolve_from_db__", None)
        elif ":" in raw:
            email, _, password = raw.partition(":")
            return (email, email, password)
    env_id = os.environ.get("PIXVERSE_WEBAPI_ACCOUNT_ID", "").strip()
    if env_id.isdigit():
        return (f"account:{env_id}", "__resolve_from_db__", None)
    env_email = os.environ.get("PIXVERSE_WEBAPI_EMAIL", "").strip()
    env_password = os.environ.get("PIXVERSE_WEBAPI_PASSWORD", "").strip()
    if env_email and env_password:
        return (env_email, env_email, env_password)
    return (DEFAULT_EMAIL, DEFAULT_EMAIL, DEFAULT_PASSWORD)


_CREDS_LABEL, _CREDS_EMAIL, _CREDS_PASSWORD = _resolve_webapi_creds()


async def _build_client() -> Any:
    """Build a PixverseClient from the resolved creds.

    For ``account:<id>`` mode, loads the account from pixsim7 DB and uses its
    existing session (JWT + cookies) directly — no login roundtrip.
    """
    if _CREDS_EMAIL == "__resolve_from_db__":
        # Lazy import — pixsim7 infra only needed for account: mode.
        from pixsim7.backend.main.domain.providers import ProviderAccount
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        account_id = int(_CREDS_LABEL.split(":", 1)[1])
        async with get_async_session() as session:
            acc = await session.get(ProviderAccount, account_id)
            if acc is None:
                sys.exit(f"ProviderAccount {account_id} not found in pixsim7 DB.")
            if acc.provider_id != "pixverse":
                sys.exit(f"Account {account_id} is provider_id={acc.provider_id}, not pixverse.")
            if not acc.jwt_token:
                sys.exit(
                    f"Account {account_id} ({acc.email}) has no JWT token — "
                    "can't use WebAPI without an active session.  Log in via "
                    "the app first, or pass email:password directly."
                )
            print(f"[{_ts()}] Using account:{account_id} ({acc.email}) from pixsim7 DB.")
            return PixverseClient(
                email=acc.email,
                session={
                    "jwt_token": acc.jwt_token,
                    "cookies": acc.cookies or {},
                    "use_method": "web-api",
                },
            )
    else:
        print(f"[{_ts()}] Creating client for {_CREDS_EMAIL} (email+password login)...")
        return PixverseClient(email=_CREDS_EMAIL, password=_CREDS_PASSWORD)

# Toggle which test to run — user-confirmed both trip moderation, "flagged"
# has the explicit prompt signal.
TEST_MODE = "flagged"

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

POLL_INTERVAL_SEC = 0.25          # fast polling to resolve sub-second window
HEAD_PROBE_INTERVAL_SEC = 0.5     # parallel HEAD probe cadence
MAX_POLL_MINUTES = 6
POST_TERMINAL_PROBE_SEC = 60      # keep probing the real URL after swap


# ── Data types ───────────────────────────────────────────────────────────


@dataclass
class _Observation:
    t_rel: float            # seconds since t0 (submit response)
    source: str             # "get_video" | "list_videos" | "head_probe"
    raw_status: Any = None
    url: Optional[str] = None
    url_is_placeholder: bool = False
    url_is_retrievable: bool = False
    thumbnail_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    http_status: Optional[int] = None
    note: str = ""


@dataclass
class _Timeline:
    t0: float
    observations: list[_Observation] = field(default_factory=list)
    # Key transition timestamps (relative to t0)
    t_first_real_get: Optional[float] = None
    t_first_real_list: Optional[float] = None
    t_placeholder_get: Optional[float] = None
    t_placeholder_list: Optional[float] = None
    t_404: Optional[float] = None
    t_first_thumbnail_get: Optional[float] = None
    t_first_thumbnail_list: Optional[float] = None
    last_real_url: Optional[str] = None
    unique_thumbnails: list[str] = field(default_factory=list)

    def record(self, ob: _Observation) -> None:
        self.observations.append(ob)
        if ob.url_is_retrievable:
            if ob.source == "get_video" and self.t_first_real_get is None:
                self.t_first_real_get = ob.t_rel
            if ob.source == "list_videos" and self.t_first_real_list is None:
                self.t_first_real_list = ob.t_rel
            if ob.url:
                self.last_real_url = ob.url
        if ob.url_is_placeholder:
            if ob.source == "get_video" and self.t_placeholder_get is None:
                self.t_placeholder_get = ob.t_rel
            if ob.source == "list_videos" and self.t_placeholder_list is None:
                self.t_placeholder_list = ob.t_rel
        if ob.source == "head_probe" and ob.http_status and ob.http_status >= 400:
            if self.t_404 is None:
                self.t_404 = ob.t_rel
        if ob.thumbnail_url and ob.thumbnail_url.startswith(("http://", "https://")):
            if ob.thumbnail_url not in self.unique_thumbnails:
                self.unique_thumbnails.append(ob.thumbnail_url)
            if ob.source == "get_video" and self.t_first_thumbnail_get is None:
                self.t_first_thumbnail_get = ob.t_rel
            if ob.source == "list_videos" and self.t_first_thumbnail_list is None:
                self.t_first_thumbnail_list = ob.t_rel


# ── Helpers ──────────────────────────────────────────────────────────────


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


def _classify_url(url: Optional[str]) -> tuple[bool, bool, Optional[str]]:
    if not url:
        return False, False, None
    normalized = normalize_url(url)
    return (
        is_pixverse_placeholder_url(url),
        has_retrievable_pixverse_media_url(url),
        normalized,
    )


async def _head_probe(url: str, http_client: httpx.AsyncClient) -> dict:
    try:
        r = await http_client.head(url)
        return {"status": r.status_code, "final_url": str(r.url)}
    except Exception as e:
        return {"status": None, "error": str(e)[:120]}


async def _try_get_video(client: PixverseClient, job_id: str) -> Optional[Any]:
    try:
        return await client.get_video(video_id=job_id)
    except Exception as e:
        print(f"[{_ts()}]   get_video error: {e}")
        return None


async def _try_list_videos(client: PixverseClient, job_id: str) -> Optional[dict]:
    try:
        videos = await client.list_videos(limit=50, offset=0)
        for v in videos or []:
            raw_id = v.get("video_id") if isinstance(v, dict) else None
            if str(raw_id) == str(job_id):
                return v
        return None
    except Exception as e:
        print(f"[{_ts()}]   list_videos error: {e}")
        return None


def _extract_fields(v: Any) -> dict:
    """Extract status/url/dims from either a pydantic-ish object or a dict."""
    if v is None:
        return {}
    if isinstance(v, dict):
        raw_status = v.get("video_status") or v.get("status")
        url = v.get("url") or v.get("video_url")
        thumb = v.get("first_frame") or v.get("thumbnail") or v.get("thumbnail_url")
        width = v.get("output_width") or v.get("width")
        height = v.get("output_height") or v.get("height")
    else:
        raw_status = getattr(v, "video_status", None) or getattr(v, "status", None)
        url = getattr(v, "url", None) or getattr(v, "video_url", None)
        thumb = getattr(v, "first_frame", None) or getattr(v, "thumbnail", None)
        width = getattr(v, "output_width", None) or getattr(v, "width", None)
        height = getattr(v, "output_height", None) or getattr(v, "height", None)
    return {
        "raw_status": raw_status,
        "url": url,
        "thumb": thumb,
        "width": width,
        "height": height,
    }


# ── Probe monitor (runs in parallel with polling loop) ──────────────────


async def _head_probe_monitor(
    timeline: _Timeline,
    stop_event: asyncio.Event,
    http_client: httpx.AsyncClient,
) -> None:
    """Continuously HEAD-probe the most recent real CDN URL.

    We run this in parallel with polling so the 404-transition doesn't have
    to wait for a poll tick. This resolves ``t_404`` to ~500 ms precision.
    """
    last_probed = None
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=HEAD_PROBE_INTERVAL_SEC)
        except asyncio.TimeoutError:
            pass
        url = timeline.last_real_url
        if not url:
            continue
        result = await _head_probe(url, http_client)
        t_rel = time.monotonic() - timeline.t0
        status = result.get("status")
        url_preview = url[:80]
        note = "same_url" if url == last_probed else "new_url"
        last_probed = url
        ob = _Observation(
            t_rel=t_rel,
            source="head_probe",
            url=url,
            http_status=status,
            note=f"{note} {result.get('final_url', '')[:80]}",
        )
        timeline.record(ob)
        marker = "✓" if status and status < 400 else "✗"
        print(
            f"[{_ts()}] +{t_rel:6.2f}s  HEAD {marker} status={status} "
            f"url={url_preview}"
        )


# ── Main ─────────────────────────────────────────────────────────────────


async def main() -> None:
    client = await _build_client()
    print(f"[{_ts()}] Logged in. Submitting i2v job ({TEST_MODE} mode)...")

    video = await client.create(
        prompt=PROMPT,
        image_url=SOURCE_IMAGE_URL,
        model=MODEL,
        duration=DURATION,
        quality="360p",
        audio=False,
    )
    job_id = str(video.id)
    t0 = time.monotonic()
    print(f"[{_ts()}] Submitted — job_id={job_id}  t0 set.")

    timeline = _Timeline(t0=t0)
    stop_event = asyncio.Event()

    async with httpx.AsyncClient(
        timeout=5.0,
        follow_redirects=True,
        headers={"User-Agent": "PixSim7-EarlyCDN-Probe/1.0"},
    ) as http_client:
        probe_task = asyncio.create_task(
            _head_probe_monitor(timeline, stop_event, http_client)
        )

        deadline = t0 + MAX_POLL_MINUTES * 60
        terminal = False
        seen_get_statuses: list[str] = []
        seen_list_statuses: list[str] = []

        while time.monotonic() < deadline:
            await asyncio.sleep(POLL_INTERVAL_SEC)
            t_rel = time.monotonic() - t0

            gv_result, lv_result = await asyncio.gather(
                _try_get_video(client, job_id),
                _try_list_videos(client, job_id),
            )

            for source, payload, seen in (
                ("get_video", gv_result, seen_get_statuses),
                ("list_videos", lv_result, seen_list_statuses),
            ):
                fields = _extract_fields(payload)
                if not fields:
                    continue
                status_str = str(fields["raw_status"])
                if status_str not in seen:
                    seen.append(status_str)
                is_ph, is_ret, _ = _classify_url(fields["url"])
                # Classify the thumbnail URL the same way — ``default.jpg``
                # placeholders appear for FILTERED videos and must NOT be
                # treated as real last-frame URLs.
                thumb_raw = fields.get("thumb")
                thumb_is_ph = is_pixverse_placeholder_url(thumb_raw) if thumb_raw else False
                thumb_is_real = bool(thumb_raw) and not thumb_is_ph
                ob = _Observation(
                    t_rel=t_rel,
                    source=source,
                    raw_status=fields["raw_status"],
                    url=fields["url"],
                    url_is_placeholder=is_ph,
                    url_is_retrievable=is_ret,
                    # Only feed REAL thumbnails into the timeline.
                    thumbnail_url=thumb_raw if thumb_is_real else None,
                    width=fields["width"],
                    height=fields["height"],
                )
                timeline.record(ob)

                url_tag = (
                    "RETRIEVABLE" if is_ret else "PLACEHOLDER" if is_ph else
                    "-" if not fields["url"] else "other"
                )
                dims_str = f"{fields['width'] or 0}x{fields['height'] or 0}"
                thumb_tag = (
                    "YES" if thumb_is_real
                    else "PLH" if thumb_is_ph
                    else " no"
                )
                print(
                    f"[{_ts()}] +{t_rel:6.2f}s  {source:11s}  "
                    f"status={str(fields['raw_status']):<4}  "
                    f"dims={dims_str:<11}  "
                    f"url={url_tag}  "
                    f"thumb={thumb_tag}"
                )

            # Terminal detection uses get_video (prod path)
            gv_fields = _extract_fields(gv_result)
            gv_status = gv_fields.get("raw_status")
            if isinstance(gv_status, int):
                if gv_status in (1,) or (
                    gv_status == 10
                    and gv_fields.get("width")
                    and gv_fields.get("height")
                ):
                    print(f"[{_ts()}] === get_video COMPLETED (raw={gv_status}) ===")
                    terminal = True
                elif gv_status in (3, 7):
                    print(f"[{_ts()}] === get_video FILTERED (raw={gv_status}) ===")
                    terminal = True
                elif gv_status in (-1, 4, 8, 9):
                    print(f"[{_ts()}] === get_video FAILED (raw={gv_status}) ===")
                    terminal = True

            if terminal:
                break

        # Short-circuit post-terminal monitoring for filtered jobs — Pixverse
        # never produces a real last frame for moderated content, so there's
        # nothing to wait for.  (Filter codes per Pixverse SDK: 7 = filtered,
        # 3 = legacy filter that the SDK doesn't currently emit.)
        was_filtered = any(
            isinstance(r, int) and r in (3, 7)
            for r in (
                [int(s) for s in seen_get_statuses if str(s).lstrip('-').isdigit()]
                + [int(s) for s in seen_list_statuses if str(s).lstrip('-').isdigit()]
            )
        )
        if was_filtered:
            print(
                f"\n[{_ts()}] Skipping post-terminal monitoring — video was "
                f"FILTERED.  Pixverse doesn't produce a real last-frame URL "
                f"for moderated content (last_frame='' in the raw response)."
            )

        # Keep probing + polling get_video/list_videos after terminal to
        # catch late-arriving thumbnail URLs (Pixverse often writes
        # customer_video_last_frame_url some seconds AFTER the video file
        # itself appears).  Also keeps HEAD-probing in background.
        if (timeline.last_real_url or terminal) and not was_filtered:
            print(
                f"\n[{_ts()}] Post-terminal monitoring (get_video + list_videos "
                f"+ HEAD) for up to {POST_TERMINAL_PROBE_SEC}s — watching for "
                f"a late thumbnail_url..."
            )
            post_deadline = time.monotonic() + POST_TERMINAL_PROBE_SEC
            thumb_seen = bool(timeline.unique_thumbnails)
            while time.monotonic() < post_deadline:
                await asyncio.sleep(2.0)
                t_rel = time.monotonic() - t0
                gv, lv = await asyncio.gather(
                    _try_get_video(client, job_id),
                    _try_list_videos(client, job_id),
                )
                for src, payload in (("get_video", gv), ("list_videos", lv)):
                    f = _extract_fields(payload)
                    if not f:
                        continue
                    is_ph, is_ret, _ = _classify_url(f.get("url"))
                    thumb_raw = f.get("thumb")
                    thumb_is_ph = is_pixverse_placeholder_url(thumb_raw) if thumb_raw else False
                    thumb_is_real = bool(thumb_raw) and not thumb_is_ph
                    timeline.record(
                        _Observation(
                            t_rel=t_rel,
                            source=src,
                            raw_status=f.get("raw_status"),
                            url=f.get("url"),
                            url_is_placeholder=is_ph,
                            url_is_retrievable=is_ret,
                            thumbnail_url=thumb_raw if thumb_is_real else None,
                            width=f.get("width"),
                            height=f.get("height"),
                        )
                    )
                    if thumb_is_real and not thumb_seen:
                        print(
                            f"[{_ts()}] +{t_rel:6.2f}s  POST-TERMINAL real "
                            f"thumbnail appeared via {src}: {thumb_raw}"
                        )
                        thumb_seen = True
                if thumb_seen:
                    # Give HEAD-probe another chance but we have what we need.
                    break

        stop_event.set()
        await probe_task

    # ── Summary ──────────────────────────────────────────────────────────
    def fmt(v: Optional[float]) -> str:
        return f"{v:6.2f}s" if v is not None else "   n/a"

    print("\n" + "=" * 72)
    print(f"Job ID:                 {job_id}")
    print(f"get_video statuses:     {' → '.join(seen_get_statuses)}")
    print(f"list_videos statuses:   {' → '.join(seen_list_statuses)}")
    print(f"t_first_real_get:       {fmt(timeline.t_first_real_get)}")
    print(f"t_first_real_list:      {fmt(timeline.t_first_real_list)}")
    print(f"t_first_thumb_get:      {fmt(timeline.t_first_thumbnail_get)}")
    print(f"t_first_thumb_list:     {fmt(timeline.t_first_thumbnail_list)}")
    print(f"t_placeholder_get:      {fmt(timeline.t_placeholder_get)}")
    print(f"t_placeholder_list:     {fmt(timeline.t_placeholder_list)}")
    print(f"t_404 (HEAD):           {fmt(timeline.t_404)}")

    # The two numbers that matter:
    if timeline.t_first_real_get is not None and timeline.t_placeholder_get is not None:
        window = timeline.t_placeholder_get - timeline.t_first_real_get
        print(f"get_video window:       {window:6.2f}s  "
              f"(how long the real URL was advertised by get_video)")
    if timeline.t_first_real_list is not None and timeline.t_placeholder_list is not None:
        window = timeline.t_placeholder_list - timeline.t_first_real_list
        print(f"list_videos window:     {window:6.2f}s  "
              f"(how long the real URL was advertised by list_videos)")
    if timeline.t_first_real_get is not None and timeline.t_404 is not None:
        lifespan = timeline.t_404 - timeline.t_first_real_get
        print(f"CDN lifespan (200→404): {lifespan:6.2f}s  "
              f"(how long the file itself was fetchable)")
    elif timeline.t_first_real_get is not None and timeline.t_404 is None:
        print(
            "CDN lifespan (200→404):  no 404 observed — file still fetchable "
            f"after {POST_TERMINAL_PROBE_SEC}s post-terminal"
        )
    print(f"unique thumbnails seen: {len(timeline.unique_thumbnails)}")
    for i, t in enumerate(timeline.unique_thumbnails, 1):
        print(f"  [{i}] {t}")
    if not timeline.unique_thumbnails:
        print(
            "NOTE: no thumbnail/last-frame URL observed across the lifecycle "
            "(including post-terminal monitoring).  Pixverse didn't expose "
            "customer_video_last_frame_url for this job — synthetic extend "
            "off this video will have no reusable seed."
        )
    print("=" * 72)


if __name__ == "__main__":
    asyncio.run(main())
