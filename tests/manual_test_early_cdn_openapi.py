"""
Manual test: observe Pixverse OpenAPI early-CDN behaviour for a filter-bait
text-to-video prompt.

Companion to ``manual_test_early_cdn.py`` (which covers the WebAPI path).
This script asks:

  - Does OpenAPI advertise a CDN URL at all, or does it return bytes / a
    different shape?
  - If yes, is there an early-CDN window (URL visible before terminal) the
    same way WebAPI has one?
  - Does it swap to a `/default.mp4`-style placeholder on filter, or return
    a distinct error / different URL pattern?
  - What do the URLs actually look like?

Usage:
    PIXVERSE_OPENAPI_KEY=<your-key> python tests/manual_test_early_cdn_openapi.py
    python tests/manual_test_early_cdn_openapi.py <key> [image_arg] [prompt]

Third positional arg (or env ``PIXVERSE_PROMPT``) overrides the default
prompt.  If the prompt contains spaces, quote it.

Second positional arg (or env) lets you skip the upload step:
  - local image path (default) → uploads fresh
  - ``img_id:<N>`` or plain integer (env ``PIXVERSE_IMG_ID``) → reuses a prior
    OpenAPI upload
  - ``asset:<N>`` (env ``PIXVERSE_ASSET_ID``) → look up pixsim7 asset; if its
    ``provider_uploads["pixverse"]`` has a cached img_id, reuse it; otherwise
    upload the asset's ``local_path`` via the test's own OpenAPI client.
  - ``url:<url>`` or plain ``http(s)://...`` (env ``PIXVERSE_IMG_URL``) → probes
    whether the OpenAPI i2v endpoint accepts a URL field (tries ``img_url``,
    ``image_url``, ``customer_img_url`` in order; stops on first success).
    Verifies the undocumented URL-input path that file-bytes uploads also
    return via their ``url`` field.

The OpenAPI key for an account lives in ``provider_accounts.api_keys`` as a
JSON entry ``{"kind": "openapi", "value": "<key>", ...}``.  For account
``stst1616`` you can pull it with:

    docker exec pixsim7-db psql -U pixsim -d pixsim7 -c \
      "SELECT api_keys FROM provider_accounts
       WHERE provider_id='pixverse' AND email='stst1616@gmail.com'"

(or whatever identifier the account is stored under).
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

# Allow running as a plain script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import httpx
from pixverse import PixverseClient
from pixverse.accounts import AccountPool

from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url,
    normalize_url,
)

# ── Test parameters ──────────────────────────────────────────────────────

# The OpenAPI key.  Preferred: pass as a positional argument on the command
# line.  Fallback: ``PIXVERSE_OPENAPI_KEY`` env var.  Do NOT commit.
def _resolve_openapi_key() -> str:
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        return sys.argv[1].strip()
    env_val = os.environ.get("PIXVERSE_OPENAPI_KEY", "").strip()
    if env_val:
        return env_val
    sys.exit(
        "OpenAPI key required. Pass it as the first argument:\n"
        "    python tests/manual_test_early_cdn_openapi.py <your-key>\n"
        "or set PIXVERSE_OPENAPI_KEY in the environment.\n"
        "Grab it from provider_accounts.api_keys for the target account."
    )


OPENAPI_KEY = _resolve_openapi_key()


def _resolve_reuse_img_id() -> Optional[int]:
    """Return a reusable OpenAPI img_id from argv[2] or env, or None.

    argv[2] REQUIRES the ``img_id:<N>`` sentinel (a bare integer is
    rejected elsewhere as ambiguous between img_id and asset_id).  The
    dedicated env var ``PIXVERSE_IMG_ID`` accepts a bare integer since
    its name makes the intent explicit.
    """
    if len(sys.argv) >= 3:
        argv = sys.argv[2].strip()
        if argv.startswith("img_id:"):
            inner = argv.split(":", 1)[1].strip()
            if inner.isdigit():
                return int(inner)
    env_val = os.environ.get("PIXVERSE_IMG_ID", "").strip()
    if env_val.startswith("img_id:"):
        env_val = env_val.split(":", 1)[1].strip()
    if env_val.isdigit():
        return int(env_val)
    return None


REUSE_IMG_ID = _resolve_reuse_img_id()


def _resolve_reuse_url() -> Optional[str]:
    """Return a reusable image URL from argv[2] or env, or None.

    Accepts ``url:<url>`` sentinel or a bare ``http(s)://...`` string.  Any
    other shape falls through (the img_id / path resolvers will pick it up).
    """
    candidates: list[str] = []
    if len(sys.argv) >= 3 and sys.argv[2].strip():
        candidates.append(sys.argv[2].strip())
    env_val = os.environ.get("PIXVERSE_IMG_URL", "").strip()
    if env_val:
        candidates.append(env_val)
    for c in candidates:
        if c.startswith("url:"):
            c = c[len("url:"):].strip()
        if c.startswith(("http://", "https://")):
            return c
    return None


REUSE_URL = _resolve_reuse_url()


def _resolve_reuse_asset_id() -> Optional[int]:
    """Return a pixsim7 asset id from argv[2] ``asset:<N>`` or env.

    In argv[2] the ``asset:`` sentinel is required (a bare integer is
    interpreted as an img_id).  ``PIXVERSE_ASSET_ID`` env is a distinct
    var from ``PIXVERSE_IMG_ID``, so it accepts a bare integer.
    """
    if len(sys.argv) >= 3:
        argv = sys.argv[2].strip()
        if argv.startswith("asset:"):
            inner = argv.split(":", 1)[1].strip()
            if inner.isdigit():
                return int(inner)
    env_val = os.environ.get("PIXVERSE_ASSET_ID", "").strip()
    if env_val.startswith("asset:"):
        env_val = env_val.split(":", 1)[1].strip()
    if env_val.isdigit():
        return int(env_val)
    return None


REUSE_ASSET_ID = _resolve_reuse_asset_id()


def _resolve_inspect_video_id() -> Optional[str]:
    """Return a Pixverse video_id to inspect (no new submission).

    Accepts ``video:<id>`` sentinel in argv[2] or ``PIXVERSE_INSPECT_VIDEO_ID``
    env var.  When set, the test skips upload + submit and just calls
    ``client.get_video(video_id)`` to dump the raw response.
    """
    if len(sys.argv) >= 3:
        argv = sys.argv[2].strip()
        if argv.startswith("video:"):
            inner = argv.split(":", 1)[1].strip()
            if inner:
                return inner
    env_val = os.environ.get("PIXVERSE_INSPECT_VIDEO_ID", "").strip()
    if env_val.startswith("video:"):
        env_val = env_val.split(":", 1)[1].strip()
    if env_val:
        return env_val
    return None


INSPECT_VIDEO_ID = _resolve_inspect_video_id()


def _reject_bare_int_argv() -> None:
    """Fail fast if argv[2] is a bare integer with no sentinel.

    A bare int is ambiguous: it could mean a Pixverse img_id (huge number)
    or a pixsim7 asset id (small number).  Require the user to say which.
    """
    if len(sys.argv) < 3:
        return
    argv = sys.argv[2].strip()
    if not argv:
        return
    if argv.isdigit():
        sys.exit(
            f"\n  Ambiguous arg '{argv}' — is this a Pixverse img_id or a\n"
            f"  pixsim7 asset id?  Prefix to say:\n"
            f"     asset:{argv}     (pixsim7 DB lookup, upload local file if needed)\n"
            f"     img_id:{argv}    (skip upload, use this Pixverse img_id directly)\n"
            f"     video:{argv}     (inspect-only mode — dump get_video response)\n"
        )


_reject_bare_int_argv()


# Pixverse's OpenAPI i2v endpoint is documented as accepting only ``img_id``,
# but file-bytes uploads return a ``url`` the adapter stores instead of the
# integer id — hence the probe.  Field names to try, in order.
URL_FIELD_CANDIDATES = ["img_url", "image_url", "customer_img_url"]
PIXVERSE_BASE_URL = "https://app-api.pixverse.ai"

# Filter-bait image-to-video.  Second positional arg (optional) is a local
# image path; default is asset 46355's local file — a naked-ish image that
# reliably trips moderation post-render.  Pixverse OpenAPI requires an
# integer ``img_id`` (URLs aren't accepted) so we must run the upload step
# first: /openapi/v2/image/upload → img_id → /openapi/v2/video/img/generate.
#
# Fields per Pixverse OpenAPI docs:
#   - ``aspect_ratio`` is NOT a valid i2v field; SDK pops it automatically.
#   - ``motion_mode="normal"`` is supported on v6.
#   - img_id is required; SDK injects it when image_url starts with ``img_id:``.
DEFAULT_IMAGE_PATH = (
    r"G:\code\pixsim7\data\media\u\1\content\9d"
    r"\9dd9e9ca40eb7b4f43d9ec0235d8837bf7a2e28ba93ae7f59990eee159007734.jpg"
)
DEFAULT_PROMPT = "ACTIONS = SHE DANCES WILDLY, FIGURE 8 STRIPPER STYLE, BACK TO CAMERA"


def _resolve_prompt() -> str:
    """Return prompt from argv[3] or ``PIXVERSE_PROMPT`` env, else default."""
    if len(sys.argv) >= 4 and sys.argv[3].strip():
        return sys.argv[3].strip()
    env_val = os.environ.get("PIXVERSE_PROMPT", "").strip()
    if env_val:
        return env_val
    return DEFAULT_PROMPT


PROMPT = _resolve_prompt()
MODEL = "v6"
DURATION = 5
QUALITY = "360p"
MOTION_MODE = "normal"

POLL_INTERVAL_SEC = 0.25
HEAD_PROBE_INTERVAL_SEC = 0.5
MAX_POLL_MINUTES = 6
POST_TERMINAL_PROBE_SEC = 60


# ── Data types ───────────────────────────────────────────────────────────


@dataclass
class _Observation:
    t_rel: float
    source: str
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
    t_first_url: Optional[float] = None          # ANY url appears
    t_first_retrievable: Optional[float] = None  # url passes /openapi/output or /web/ori check
    t_placeholder: Optional[float] = None        # url matches known placeholder paths
    t_404: Optional[float] = None
    t_first_thumbnail: Optional[float] = None    # first time get_video returns a thumbnail URL
    unique_urls: list[str] = field(default_factory=list)
    unique_thumbnails: list[str] = field(default_factory=list)
    last_url: Optional[str] = None

    def record(self, ob: _Observation) -> None:
        self.observations.append(ob)
        if ob.url:
            if ob.url not in self.unique_urls:
                self.unique_urls.append(ob.url)
            self.last_url = ob.url
            if self.t_first_url is None:
                self.t_first_url = ob.t_rel
        if ob.url_is_retrievable and self.t_first_retrievable is None:
            self.t_first_retrievable = ob.t_rel
        if ob.url_is_placeholder and self.t_placeholder is None:
            self.t_placeholder = ob.t_rel
        if ob.source == "head_probe" and ob.http_status and ob.http_status >= 400:
            if self.t_404 is None:
                self.t_404 = ob.t_rel
        if ob.thumbnail_url and ob.thumbnail_url.startswith(("http://", "https://")):
            if ob.thumbnail_url not in self.unique_thumbnails:
                self.unique_thumbnails.append(ob.thumbnail_url)
            if self.t_first_thumbnail is None:
                self.t_first_thumbnail = ob.t_rel


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
    # Pixverse returns URLs with URL-encoded slashes (%2F); fetching those
    # verbatim can 404 on some CDN configurations even though the decoded
    # URL is live.  Normalize before probing.
    normalized = normalize_url(url) or url
    try:
        r = await http_client.head(normalized)
        return {"status": r.status_code, "final_url": str(r.url)}
    except Exception as e:
        return {"status": None, "error": str(e)[:120]}


def _extract_fields(v: Any) -> dict:
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


async def _resolve_app_asset(asset_id: int) -> tuple[Optional[str], Optional[str]]:
    """Resolve a pixsim7 asset to (cached_img_id, local_path).

    Looks up provider_uploads["pixverse"] — returns the cached img_id if
    one is already present (dict or legacy digit-string shape).  Otherwise
    returns the asset's local_path so the caller can upload it.
    """
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from sqlalchemy import select

    async with get_async_session() as session:
        row = (
            await session.execute(select(Asset).where(Asset.id == asset_id))
        ).scalar_one_or_none()
        if not row:
            return None, None
        entry = (row.provider_uploads or {}).get("pixverse")
        cached_id: Optional[str] = None
        if isinstance(entry, dict):
            raw = entry.get("id")
            if raw is not None and str(raw).isdigit():
                cached_id = str(raw)
        elif isinstance(entry, str) and entry.isdigit():
            cached_id = entry
        return cached_id, row.local_path


async def _probe_openapi_url_fields(
    openapi_key: str,
    image_url: str,
) -> dict:
    """Probe which URL field name Pixverse's OpenAPI i2v endpoint accepts.

    Tries each of ``URL_FIELD_CANDIDATES`` in order, posting a minimal
    generation payload.  Returns the first success:

        {
            "video_id": str,
            "field_name": str,
            "raw_response": dict,
        }

    Exits the process if every candidate returns an API-level error.  Each
    successful try costs one generation (so we stop immediately on the first
    accepted field name).
    """
    import uuid as _uuid

    endpoint = f"{PIXVERSE_BASE_URL}/openapi/v2/video/img/generate"
    base_payload = {
        "prompt": PROMPT,
        "model": MODEL,
        "duration": DURATION,
        "quality": QUALITY,
        "motion_mode": MOTION_MODE,
    }

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        last_errors: list[tuple[str, Any]] = []
        for field_name in URL_FIELD_CANDIDATES:
            payload = {**base_payload, field_name: image_url}
            headers = {
                "API-KEY": openapi_key,
                "Ai-trace-id": str(_uuid.uuid4()),
                "Content-Type": "application/json",
            }
            print(
                f"[{_ts()}] Probing field '{field_name}' with URL "
                f"{image_url[:80]}..."
            )
            try:
                resp = await http_client.post(endpoint, json=payload, headers=headers)
                body = resp.json()
            except Exception as e:
                print(f"[{_ts()}]   transport error: {e}")
                last_errors.append((field_name, str(e)))
                continue

            err_code = body.get("ErrCode")
            err_msg = body.get("ErrMsg")
            resp_obj = body.get("Resp") or {}
            video_id = resp_obj.get("video_id") or resp_obj.get("id")

            print(
                f"[{_ts()}]   HTTP {resp.status_code}  "
                f"ErrCode={err_code}  ErrMsg={err_msg}  "
                f"Resp={resp_obj}"
            )

            if resp.status_code == 200 and err_code == 0 and video_id:
                print(f"[{_ts()}] ✓ Field '{field_name}' ACCEPTED  video_id={video_id}")
                return {
                    "video_id": str(video_id),
                    "field_name": field_name,
                    "raw_response": body,
                }
            last_errors.append((field_name, f"ErrCode={err_code} ErrMsg={err_msg}"))

    print(f"[{_ts()}] ✗ No URL field accepted.  Attempts:")
    for name, reason in last_errors:
        print(f"  - {name}: {reason}")
    sys.exit(
        "Pixverse OpenAPI did not accept any of the probed URL fields.  "
        "Either the field name we tried is wrong, or URL input isn't "
        "supported on this endpoint after all.  Use --img-id / a local path "
        "instead."
    )


async def _head_probe_monitor(
    timeline: _Timeline,
    stop_event: asyncio.Event,
    http_client: httpx.AsyncClient,
) -> None:
    last_probed = None
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=HEAD_PROBE_INTERVAL_SEC)
        except asyncio.TimeoutError:
            pass
        url = timeline.last_url
        if not url:
            continue
        result = await _head_probe(url, http_client)
        t_rel = time.monotonic() - timeline.t0
        status = result.get("status")
        note = "same_url" if url == last_probed else "new_url"
        last_probed = url
        ob = _Observation(
            t_rel=t_rel,
            source="head_probe",
            url=url,
            http_status=status,
            note=f"{note}",
        )
        timeline.record(ob)
        marker = "✓" if status and status < 400 else "✗"
        print(
            f"[{_ts()}] +{t_rel:6.2f}s  HEAD {marker} status={status} "
            f"url={url}"
        )


# ── Main ─────────────────────────────────────────────────────────────────


def _build_openapi_account_dict() -> dict:
    """Return a minimal SDK-Account-shaped dict that routes via OpenAPI only.

    ``AccountPool`` re-wraps each entry via ``Account(**acc)``, so we must
    pass a dict (not an ``Account`` instance) here.
    """
    return {
        "email": "openapi-test",
        "password": None,
        "session": {
            "openapi_key": OPENAPI_KEY,
            "use_method": "open-api",
        },
    }


async def main() -> None:
    print(f"[{_ts()}] Building OpenAPI-only client...")
    pool = AccountPool(accounts=[_build_openapi_account_dict()])
    client = PixverseClient(account_pool=pool)

    sdk_account = pool.accounts[0]

    # Inspect-only mode: fetch an existing video_id and dump the full SDK
    # response.  No submission, no credits, no polling.
    if INSPECT_VIDEO_ID is not None:
        print(f"[{_ts()}] Inspect mode — video_id={INSPECT_VIDEO_ID}")
        video = await client.get_video(video_id=INSPECT_VIDEO_ID)
        print("\n--- Video object ---")
        for attr in ("id", "url", "status", "prompt", "thumbnail", "duration", "model"):
            print(f"  {attr}: {getattr(video, attr, None)}")
        print("\n--- metadata (raw response data the SDK parsed) ---")
        meta = getattr(video, "metadata", None) or {}
        if isinstance(meta, dict):
            for k in sorted(meta.keys()):
                v = meta[k]
                print(f"  {k}: {v!r}")
        else:
            print(f"  {meta!r}")
        return

    probe_submit: Optional[dict] = None

    if REUSE_URL is not None:
        print(f"[{_ts()}] URL-probe mode — skipping upload and SDK submit.")
        probe_submit = await _probe_openapi_url_fields(OPENAPI_KEY, REUSE_URL)
        img_id = None  # not applicable in URL mode
    elif REUSE_ASSET_ID is not None:
        print(f"[{_ts()}] Resolving pixsim7 asset_id={REUSE_ASSET_ID}...")
        cached_id, local_path = await _resolve_app_asset(REUSE_ASSET_ID)
        if cached_id:
            img_id = cached_id
            print(f"[{_ts()}] Asset {REUSE_ASSET_ID} already has cached img_id={img_id}")
        elif local_path and Path(local_path).exists():
            print(
                f"[{_ts()}] Asset {REUSE_ASSET_ID} has no cached img_id — "
                f"uploading local file {local_path}"
            )
            upload_result = await client.api.upload_media(
                file_path=local_path,
                account=sdk_account,
            )
            img_id = upload_result.get("id")
            if not img_id:
                sys.exit(f"Upload did not return an id. Response: {upload_result}")
            print(f"[{_ts()}] Upload OK — img_id={img_id}")
        else:
            sys.exit(
                f"Asset {REUSE_ASSET_ID} not found, or has neither a cached "
                "img_id nor a local file usable for upload."
            )
    elif REUSE_IMG_ID is not None:
        img_id = REUSE_IMG_ID
        print(f"[{_ts()}] Skipping upload — reusing img_id={img_id}")
    else:
        # Locate the source image — optional second positional arg overrides
        # the default (asset 46355's local file).
        image_path = (
            sys.argv[2]
            if len(sys.argv) >= 3 and sys.argv[2].strip()
            else DEFAULT_IMAGE_PATH
        )
        if not Path(image_path).exists():
            sys.exit(
                f"Image not found at: {image_path}\n"
                "Pass a local path, or an integer / 'img_id:<N>' to reuse a "
                "prior upload."
            )
        print(f"[{_ts()}] Uploading source image via OpenAPI: {image_path}")

        # Upload via OpenAPI to get an img_id usable on the i2v endpoint.
        upload_result = await client.api.upload_media(
            file_path=image_path,
            account=sdk_account,
        )
        img_id = upload_result.get("id")
        if not img_id:
            sys.exit(f"Upload did not return an id. Response: {upload_result}")
        print(f"[{_ts()}] Upload OK — img_id={img_id}")

    if probe_submit is not None:
        # URL-probe already submitted via raw POST; skip the SDK submit.
        job_id = probe_submit["video_id"]
        t0 = time.monotonic()
        initial_fields = _extract_fields(
            probe_submit["raw_response"].get("Resp", {})
        )
        print(
            f"[{_ts()}] Using probe submission — field='{probe_submit['field_name']}'"
        )
    else:
        print(f"[{_ts()}] Submitting i2v job (OpenAPI mode)...")
        video = await client.create(
            prompt=PROMPT,
            image_url=f"img_id:{img_id}",
            model=MODEL,
            duration=DURATION,
            quality=QUALITY,
            motion_mode=MOTION_MODE,
        )
        job_id = str(video.id)
        t0 = time.monotonic()
        initial_fields = _extract_fields(video)
    print(
        f"[{_ts()}] Submitted — job_id={job_id} "
        f"initial_status={initial_fields.get('raw_status')} "
        f"initial_url={initial_fields.get('url')}"
    )

    timeline = _Timeline(t0=t0)
    stop_event = asyncio.Event()

    # Record the submit response as an observation at t≈0.
    is_ph_0, is_ret_0, _ = _classify_url(initial_fields.get("url"))
    timeline.record(
        _Observation(
            t_rel=0.0,
            source="submit",
            raw_status=initial_fields.get("raw_status"),
            url=initial_fields.get("url"),
            url_is_placeholder=is_ph_0,
            url_is_retrievable=is_ret_0,
            thumbnail_url=initial_fields.get("thumb"),
            width=initial_fields.get("width"),
            height=initial_fields.get("height"),
        )
    )

    async with httpx.AsyncClient(
        timeout=5.0,
        follow_redirects=True,
        headers={"User-Agent": "PixSim7-EarlyCDN-OpenAPI-Probe/1.0"},
    ) as http_client:
        probe_task = asyncio.create_task(
            _head_probe_monitor(timeline, stop_event, http_client)
        )

        deadline = t0 + MAX_POLL_MINUTES * 60
        terminal = False
        seen_statuses: list[str] = []

        while time.monotonic() < deadline:
            await asyncio.sleep(POLL_INTERVAL_SEC)
            t_rel = time.monotonic() - t0

            try:
                v = await client.get_video(video_id=job_id)
            except Exception as e:
                print(f"[{_ts()}] +{t_rel:6.2f}s  get_video ERROR: {e}")
                continue

            fields = _extract_fields(v)
            status_str = str(fields["raw_status"])
            if status_str not in seen_statuses:
                seen_statuses.append(status_str)
            is_ph, is_ret, _ = _classify_url(fields["url"])
            ob = _Observation(
                t_rel=t_rel,
                source="get_video",
                raw_status=fields["raw_status"],
                url=fields["url"],
                url_is_placeholder=is_ph,
                url_is_retrievable=is_ret,
                thumbnail_url=fields.get("thumb"),
                width=fields["width"],
                height=fields["height"],
            )
            timeline.record(ob)

            url_tag = (
                "RETRIEVABLE" if is_ret else "PLACEHOLDER" if is_ph else
                "-" if not fields["url"] else "other"
            )
            dims_str = f"{fields['width'] or 0}x{fields['height'] or 0}"
            thumb_present = bool(fields.get("thumb"))
            print(
                f"[{_ts()}] +{t_rel:6.2f}s  get_video    "
                f"status={str(fields['raw_status']):<4}  "
                f"dims={dims_str:<11}  "
                f"url={url_tag}  "
                f"thumb={'YES' if thumb_present else ' no'}  "
                f"raw={fields['url'] or ''}"
            )

            raw_status = fields.get("raw_status")
            if isinstance(raw_status, int):
                if raw_status == 1 or (
                    raw_status == 10 and fields.get("width") and fields.get("height")
                ):
                    print(f"[{_ts()}] === COMPLETED (raw={raw_status}) ===")
                    terminal = True
                elif raw_status == 7:
                    # Pixverse SDK maps 7 = filtered (see pixverse/api/client.py).
                    # '3' was a legacy/erroneous code — not in current docs.
                    print(f"[{_ts()}] === FILTERED (raw={raw_status}) ===")
                    terminal = True
                elif raw_status in (-1, 4, 8, 9):
                    print(f"[{_ts()}] === FAILED (raw={raw_status}) ===")
                    terminal = True

            if terminal:
                break

        if timeline.last_url:
            print(
                f"\n[{_ts()}] Post-terminal monitoring (get_video + HEAD) "
                f"for up to {POST_TERMINAL_PROBE_SEC}s — watching for a late "
                f"thumbnail_url to appear..."
            )
            post_deadline = time.monotonic() + POST_TERMINAL_PROBE_SEC
            while time.monotonic() < post_deadline:
                await asyncio.sleep(2.0)
                t_rel = time.monotonic() - t0
                try:
                    v = await client.get_video(video_id=job_id)
                except Exception:
                    continue
                f = _extract_fields(v)
                is_ph, is_ret, _ = _classify_url(f.get("url"))
                timeline.record(
                    _Observation(
                        t_rel=t_rel,
                        source="get_video_post_terminal",
                        raw_status=f.get("raw_status"),
                        url=f.get("url"),
                        url_is_placeholder=is_ph,
                        url_is_retrievable=is_ret,
                        thumbnail_url=f.get("thumb"),
                        width=f.get("width"),
                        height=f.get("height"),
                    )
                )
                if f.get("thumb"):
                    print(
                        f"[{_ts()}] +{t_rel:6.2f}s  POST-TERMINAL thumbnail appeared: "
                        f"{f.get('thumb')}"
                    )
                    break

        stop_event.set()
        await probe_task

    # ── Summary ──────────────────────────────────────────────────────────
    def fmt(v: Optional[float]) -> str:
        return f"{v:6.2f}s" if v is not None else "   n/a"

    print("\n" + "=" * 72)
    print(f"Mode:                   OpenAPI (i2v)")
    print(f"Job ID:                 {job_id}")
    print(f"get_video statuses:     {' → '.join(seen_statuses)}")
    print(f"t_first_url:            {fmt(timeline.t_first_url)}")
    print(f"t_first_retrievable:    {fmt(timeline.t_first_retrievable)}")
    print(f"t_first_thumbnail:      {fmt(timeline.t_first_thumbnail)}")
    print(f"t_placeholder:          {fmt(timeline.t_placeholder)}")
    print(f"t_404 (HEAD):           {fmt(timeline.t_404)}")
    print(f"unique URLs seen:       {len(timeline.unique_urls)}")
    for i, u in enumerate(timeline.unique_urls, 1):
        print(f"  [{i}] {u}")
    print(f"unique thumbnails seen: {len(timeline.unique_thumbnails)}")
    for i, t in enumerate(timeline.unique_thumbnails, 1):
        print(f"  [{i}] {t}")

    # The windows that matter (if applicable):
    if timeline.t_first_retrievable is not None and timeline.t_placeholder is not None:
        window = timeline.t_placeholder - timeline.t_first_retrievable
        print(f"advertised window:      {window:6.2f}s  "
              f"(retrievable URL visible before swap)")
    if timeline.t_first_retrievable is not None and timeline.t_404 is not None:
        lifespan = timeline.t_404 - timeline.t_first_retrievable
        print(f"CDN lifespan (200→404): {lifespan:6.2f}s  "
              f"(how long the file itself was fetchable)")
    elif timeline.t_first_retrievable is not None and timeline.t_404 is None:
        print(
            "CDN lifespan (200→404):  no 404 observed — file still fetchable "
            f"after {POST_TERMINAL_PROBE_SEC}s post-terminal"
        )
    if not timeline.unique_urls:
        print(
            "NOTE: no URLs observed across the lifecycle — OpenAPI may not "
            "expose a CDN URL pre-terminal, or the filter short-circuits "
            "before any URL is advertised."
        )
    if not timeline.unique_thumbnails:
        print(
            "NOTE: no thumbnail/last-frame URL observed across the lifecycle "
            "(including post-terminal monitoring).  Pixverse's get_video did "
            "not expose customer_video_last_frame_url for this job — "
            "synthetic extend off this video will have no reusable seed."
        )
    else:
        if timeline.t_first_thumbnail is not None and timeline.t_first_retrievable is not None:
            delta = timeline.t_first_thumbnail - timeline.t_first_retrievable
            print(
                f"thumb vs url lag:       {delta:+6.2f}s  "
                f"(thumbnail appeared {'after' if delta >= 0 else 'before'} "
                f"the video URL)"
            )
    print("=" * 72)


if __name__ == "__main__":
    asyncio.run(main())
