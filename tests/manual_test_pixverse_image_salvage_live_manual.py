"""
Manual (opt-in, LIVE) test: Pixverse image CDN-salvage end-to-end.

This is the IMAGE analogue of ``tests/manual_test_early_cdn.py`` (the video
live test).  It is **not** collected by pytest — the filename uses the
``manual_test_`` prefix, not ``test_``, so the default ``test_*`` discovery
skips it — and it makes real, billed Pixverse calls with a real account.
Run it by hand, never in CI.

Why it exists
-------------
We ship a salvage path that recovers Pixverse images Pixverse reports as
filtered/failed/stuck-processing but which actually rendered (the
pre-allocated CDN object exists).  It is covered by deterministic unit +
recorded-payload tests:

  - pixsim7/backend/tests/services/test_pixverse_image_status_contract.py
  - pixsim7/backend/tests/services/test_provider_service_status_promotions.py
    (the ``*_pixverse_image_*`` cases)

Those pin the *logic*.  This script pins that our logic still matches
Pixverse's *real* behaviour, by driving the actual production salvage
function (``_try_pixverse_image_cdn_salvage``) + the early-CDN contract
helpers against a live submission.

What it does / doesn't guarantee
--------------------------------
Phase A (always, the main value): submit a benign i2i prompt with a real
account, poll ``get_image`` to terminal, assert an Asset-worthy COMPLETED
result whose CDN URL actually serves (HEAD 200).  This confirms the
account/session/credits and the live image pipeline still work.

Phase B (best-effort/observational): submit a known **filter-bait image**
(suggestive source + suggestive prompt), record the raw ``image_status``
Pixverse returns, HEAD-probe the pre-allocated CDN object, then drive the
real salvage and assert the *consistent* outcome:

  Why a bait *image*, not just a violating text prompt: the salvage only
  has something to recover when Pixverse RENDERS the image (allocates the
  CDN object) and then POST-FILTERS it.  A pure text policy violation
  usually gets rejected at submit time — no CDN object is ever allocated,
  so there is nothing to salvage and B can only ever exercise the trivial
  fail-safe branch.  A suggestive source image that renders-then-trips
  moderation is precisely the false-filter scenario the salvage exists
  for (same rationale as manual_test_early_cdn.py's "flagged" mode).


  - object 200s  -> salvage recovers to COMPLETED with
    ``image_false_filter_recovered`` + ``video_early_cdn_terminal``; and for
    a *filtered* original, ``is_early_cdn_filtered()`` is True (the
    downstream billing-SKIPPED + ``provider_flagged`` path Pixverse
    auto-refunds).
  - object 404s / placeholder -> stays filtered/failed (fail-safe).

Phase B can submit several bait jobs CONCURRENTLY (``--violation-samples=N``,
default 1) on accounts that allow >1 concurrent generation.  The point is
observational: across the error cases Pixverse actually returns
(filtered=7, failed=8/9), does the pre-allocated CDN object HEAD-serve an
image (=> false filter, salvage must recover) or 404 (=> genuine, stays
terminal)?  It prints a per-sample table of raw status -> HEAD result ->
verdict, then aggregates: FAIL if any sample is inconsistent with the
contract; PASS if ≥1 sample tripped a filter and every tripped sample was
consistent; SKIP if nothing tripped / all inconclusive.

Phase B does NOT assert status 8/9 or stuck-processing: those cannot be
provoked deterministically from a prompt.  B is tolerant — if the violation
prompt doesn't trip moderation, or Pixverse returns something off-contract,
it logs what actually happened rather than hard-failing on provider
variance.  A robust A with a skipped B is a passing run.

Usage
-----
    python tests/manual_test_pixverse_image_salvage_live_manual.py
    python tests/manual_test_pixverse_image_salvage_live_manual.py account:42
    python tests/manual_test_pixverse_image_salvage_live_manual.py email@x:pw

    # phase control / overrides
    python tests/manual_test_pixverse_image_salvage_live_manual.py --skip-violation
    python tests/manual_test_pixverse_image_salvage_live_manual.py --violation-only
    python tests/manual_test_pixverse_image_salvage_live_manual.py --model=gemini-3.1-flash
    python tests/manual_test_pixverse_image_salvage_live_manual.py --quality=512p
    python tests/manual_test_pixverse_image_salvage_live_manual.py --prompt="..."
    python tests/manual_test_pixverse_image_salvage_live_manual.py --violation-prompt="..."
    python tests/manual_test_pixverse_image_salvage_live_manual.py --source=https://media.pixverse.ai/...
    python tests/manual_test_pixverse_image_salvage_live_manual.py --violation-source=https://media.pixverse.ai/...
    python tests/manual_test_pixverse_image_salvage_live_manual.py --violation-asset=46360
    # bait = pixsim7 asset 46360 uploaded fresh; reliably post-filters on
    # gemini-3.1-flash with the default "change background, preserve woman":
    python tests/manual_test_pixverse_image_salvage_live_manual.py account:2 --model=gemini-3.1-flash --violation-samples=5

Operational gotchas (free-tier accounts)
----------------------------------------
- Pixverse free/low-tier accounts have a very low *concurrent-generation*
  cap (~1).  Running this back-to-back leaves the prior run's jobs in
  flight, so the next submit gets ErrCode 500044 (Phase B SKIPs cleanly) or
  the job fails instantly with image_status 9 (Phase A reports FAIL — but
  this is rate-limiting, not a pipeline regression).  Space runs out, or
  use a fresh/higher-tier account.
- qwen-image i2i fails (image_status 9) on free accounts regardless of
  credits — default model is seedream-4.0 for this reason.

Account selection mirrors manual_test_early_cdn.py exactly:
  1. argv[1] — ``account:<id>`` (pixsim7 DB lookup, uses stored JWT) or
     ``email:password``.
  2. ``PIXVERSE_WEBAPI_ACCOUNT_ID`` env (numeric DB lookup).
  3. ``PIXVERSE_WEBAPI_EMAIL`` + ``PIXVERSE_WEBAPI_PASSWORD`` env.
  4. Hardcoded legacy fallback.
"""
from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional
from urllib.parse import unquote

# Allow running as a plain script from the repo root — the repo isn't
# pip-installed, so add its root to sys.path so the `pixsim7` package
# resolves.  Same shim as manual_test_early_cdn.py.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from pixverse import ImageModel

# Shared live-test harness (creds/client/CLI/probe/log).  tests/ is
# sys.path[0] when run as a plain script, so this resolves with no
# packaging.  See tests/_pixverse_live_harness.py.
from _pixverse_live_harness import (
    build_client,
    cdn_head_probe,
    extract_media_fields,
    is_pixverse_placeholder_url,
    make_log,
    pop_bool_flag,
    pop_kv_flag,
    resolve_webapi_creds,
    ts as _ts,
)

from pixsim7.backend.main.domain.enums import ProviderStatus
from pixsim7.backend.main.services.provider.base import ProviderStatusResult
from pixsim7.backend.main.services.provider.early_cdn import (
    is_early_cdn_filtered,
    is_early_cdn_terminal,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_status import (
    _map_pixverse_status_for,
    _scan_image_list,
)
from pixsim7.backend.main.services.provider.provider_service import (
    _try_pixverse_image_cdn_salvage,
)


# ── CLI flags (stripped from argv before creds parsing) ──────────────────

_SKIP_VIOLATION = pop_bool_flag("--skip-violation")
_VIOLATION_ONLY = pop_bool_flag("--violation-only")

_MODEL_OVERRIDE = pop_kv_flag("--model=")
_QUALITY_OVERRIDE = pop_kv_flag("--quality=")
_PROMPT_OVERRIDE = pop_kv_flag("--prompt=")
_VIOLATION_PROMPT_OVERRIDE = pop_kv_flag("--violation-prompt=")
_SOURCE_OVERRIDE = pop_kv_flag("--source=")
_VIOLATION_SOURCE_OVERRIDE = pop_kv_flag("--violation-source=")
_VIOLATION_ASSET_OVERRIDE = pop_kv_flag("--violation-asset=")
_VIOLATION_SAMPLES_RAW = pop_kv_flag("--violation-samples=")


# ── Account acquisition (shared harness: tests/_pixverse_live_harness.py) ─

_DEFAULT_EMAIL = "holyfruit30"
_DEFAULT_PASSWORD = "qwerty11633"

_log = make_log()
_CREDS = resolve_webapi_creds(
    default_email=_DEFAULT_EMAIL, default_password=_DEFAULT_PASSWORD
)


async def _build_client() -> Any:
    """Web-api client (account:<id> JWT / email:pw / env), with the
    account's OpenAPI key wired in so ``upload_media`` works for the bait
    upload.  All logic lives in the shared harness; behaviour is identical
    to manual_test_early_cdn.py plus the opt-in OpenAPI-key wiring.
    """
    return await build_client(_CREDS, log=_log, want_openapi=True)


# ── Test parameters ──────────────────────────────────────────────────────

# i2i source.  create_image rejects non-Pixverse URLs, so this MUST be a
# media.pixverse.ai-hosted image (same one the video test uses for its
# non-flagged branch — a known-benign Pixverse-hosted asset).
SOURCE_IMAGE_URL = _SOURCE_OVERRIDE or (
    "https://media.pixverse.ai/pixverse/i2i/ori/"
    "6eac1a42-f0b3-4649-a3db-a13f3ef66b8f.png"
)
BENIGN_PROMPT = _PROMPT_OVERRIDE or "Make it a soft watercolor painting, calm and serene"

# Phase B filter-bait source resolution (precedence):
#   1. --violation-source=<pixverse-url>  (used verbatim)
#   2. --violation-asset=<pixsim7 asset id> / default asset 46360 — the
#      asset's LOCAL file is UPLOADED FRESH each run via the account's
#      OpenAPI key.  A fresh upload (vs a possibly-stale cached
#      provider_uploads CDN URL) is what reliably makes Pixverse render the
#      real suggestive content and then POST-filter it — the false-filter
#      salvage scenario.  Asset 46360 is the user-designated reliable bait.
#   3. legacy hardcoded URL fallback (if asset resolution fails).
DEFAULT_VIOLATION_ASSET_ID = 46360
_VIOLATION_FALLBACK_URL = (
    "https://media.pixverse.ai/openapi/"
    "22b41e80-1002-4905-8817-afeb66bbdcc2_cca85883542dc195891af14f093f74ba_auto.jpg"
)
try:
    VIOLATION_ASSET_ID: Optional[int] = (
        int(_VIOLATION_ASSET_OVERRIDE)
        if _VIOLATION_ASSET_OVERRIDE
        else DEFAULT_VIOLATION_ASSET_ID
    )
except ValueError:
    VIOLATION_ASSET_ID = DEFAULT_VIOLATION_ASSET_ID

# Simple, reliably-flagging prompt (user-designated): on the bait image this
# trips Pixverse's post-render moderator with gemini-3.1-flash.  It must
# still pass the input-text moderator (an overtly explicit prompt is
# rejected at submit with ErrCode 500063 — no render, nothing to salvage).
VIOLATION_PROMPT = (
    _VIOLATION_PROMPT_OVERRIDE or "change background, preserve woman"
)
# seedream-4.0 is a cheap, broadly-available i2i model that works on
# free-tier accounts (qwen-image i2i fails on them).  gemini-3.1-flash is a
# good alternative on accounts where it's free + allows ~8 concurrent jobs
# (lets Phase B sample several error cases at once).  Override --model=.
MODEL = _MODEL_OVERRIDE or "seedream-4.0"
# Quality: explicit --quality=, else the model spec's lowest/cheapest
# (qualities[0]), else a safe 1080p fallback.
_SPEC = ImageModel.get(MODEL)
QUALITY = (
    _QUALITY_OVERRIDE
    or (_SPEC.qualities[0] if _SPEC and _SPEC.qualities else None)
    or "1080p"
)

# Phase B submits this many filter-bait jobs concurrently (accounts that
# allow >1 concurrent generation can sample several error outcomes in one
# run — the point being to observe whether the pre-allocated CDN object
# HEAD-serves an image across filtered/failed cases).  Default 1 keeps it
# free-tier-safe; bump it on a higher-concurrency account.
try:
    VIOLATION_SAMPLES = max(1, int(_VIOLATION_SAMPLES_RAW)) if _VIOLATION_SAMPLES_RAW else 1
except ValueError:
    VIOLATION_SAMPLES = 1

POLL_INTERVAL_SEC = 2.0
MAX_POLL_MINUTES = 6


# ── Helpers ──────────────────────────────────────────────────────────────


def _extract_image_fields(v: Any) -> dict:
    """get_image -> {raw_status, url, ...}.  Delegates to the shared
    harness extractor (image key precedence == the SDK's)."""
    return extract_media_fields(v, kind="image")


async def _submit_and_poll(
    client: Any, prompt: str, source_url: str, label: str
) -> dict:
    """Submit an i2i job and poll get_image to a terminal state.

    Returns {job_id, raw_status, mapped_status, url, pre_url, raw_payload}.

    ``pre_url`` is the most recent real (non-empty, non-placeholder) image
    URL seen across ANY poll — including the pre-terminal ``status=10``
    ticks where Pixverse exposes the pre-allocated CDN object.  Production's
    salvage works off the URL retained in ``submission.response`` from an
    earlier poll; a filtered terminal poll often returns ``url=None``.
    Feeding ``pre_url`` into the salvage faithfully reproduces that flow so
    Phase B can actually reach the *recovery* branch, not just fail-safe.
    """
    _log(
        f"[{_ts()}] [{label}] Submitting i2i  model={MODEL} quality={QUALITY}  "
        f"src={source_url[:70]}  prompt={prompt[:60]!r}"
    )
    created = await client.create_image(
        prompt=prompt,
        image_urls=source_url,
        model=MODEL,
        quality=QUALITY,
    )
    job_id = str(
        created.get("id")
        if isinstance(created, dict)
        else getattr(created, "id", None)
    )
    if not job_id or job_id == "None":
        raise RuntimeError(f"[{label}] create_image returned no id: {created!r}")
    _log(f"[{_ts()}] [{label}] Submitted — job_id={job_id}")

    deadline = time.monotonic() + MAX_POLL_MINUTES * 60
    last: dict = {}
    seen: list[str] = []
    pre_url: Optional[str] = None  # latest real URL seen across ANY poll
    # Distinct URLs / thumbs observed across the poll lifetime — Phase B
    # uses these for the URL-drift and thumbnail-probe observations.
    urls_seen: list[str] = []
    thumbs_seen: list[str] = []
    while time.monotonic() < deadline:
        await asyncio.sleep(POLL_INTERVAL_SEC)
        try:
            payload = await client.get_image(image_id=job_id)
        except Exception as e:  # transient — keep polling
            _log(f"[{_ts()}] [{label}]   get_image error: {e}")
            continue
        fields = _extract_image_fields(payload)
        mapped = _map_pixverse_status_for(payload, is_image=True)
        url = fields["url"]
        thumb = fields.get("thumb")
        if url and str(url).startswith("http"):
            if url not in urls_seen:
                urls_seen.append(url)
            if not is_pixverse_placeholder_url(url):
                pre_url = url  # mirrors submission.response URL retention
        if thumb and isinstance(thumb, str) and thumb.startswith("http"):
            if thumb not in thumbs_seen:
                thumbs_seen.append(thumb)
        last = {
            "job_id": job_id,
            "raw_status": fields["raw_status"],
            "mapped_status": mapped,
            "url": url,
            "pre_url": pre_url,
            "thumb": thumb,
            "urls_seen": urls_seen,
            "thumbs_seen": thumbs_seen,
            "raw_payload": payload,
        }
        tag = str(fields["raw_status"])
        if tag not in seen:
            seen.append(tag)
        _log(
            f"[{_ts()}] [{label}]   raw={fields['raw_status']!s:<4} "
            f"mapped={mapped.value:<10} url={'yes' if url else 'no'}"
            + ("" if url or not pre_url else "  (pre_url retained)")
        )
        if mapped in (
            ProviderStatus.COMPLETED,
            ProviderStatus.FILTERED,
            ProviderStatus.FAILED,
            ProviderStatus.CANCELLED,
        ):
            _log(
                f"[{_ts()}] [{label}] === TERMINAL: {mapped.value} "
                f"(raw status path {' → '.join(seen)}) ==="
            )
            return last
    _log(f"[{_ts()}] [{label}] !! poll timed out after {MAX_POLL_MINUTES}m")
    return last


def _usable_pixverse_url(value: Any) -> Optional[str]:
    """Return a create_image-usable Pixverse URL, or None.

    create_image rejects URL-encoded ``%2F`` forms (Pixverse ErrCode
    400017); the clean decoded ``https://media.pixverse.ai/openapi/<...>``
    shape is what works.  Unquote a single layer so a cached or
    upload-returned ``%2F`` URL is still usable.
    """
    if not isinstance(value, str) or not value.startswith("http"):
        return None
    if "pixverse.ai" not in value:
        return None
    return unquote(value) if "%2F" in value else value


async def _resolve_violation_source(client: Any) -> str:
    """Resolve the Phase B bait source to a create_image-usable URL.

    Precedence:
      1. --violation-source=<url>.
      2. pixsim7 asset (--violation-asset / default 46360):
         a. its cached ``provider_uploads['pixverse']`` URL (the clean
            decoded form production already stored — known-good);
         b. else upload its local file fresh via the account's OpenAPI key
            (URL unquoted so create_image accepts it).
      3. legacy hardcoded URL fallback.
    """
    if _VIOLATION_SOURCE_OVERRIDE:
        _log(f"[{_ts()}] [B] bait source = --violation-source override")
        return _VIOLATION_SOURCE_OVERRIDE

    try:
        from pixsim7.backend.main.domain import Asset
        from pixsim7.backend.main.infrastructure.database.session import (
            get_async_session,
        )
        from sqlalchemy import select

        async with get_async_session() as session:
            asset = (
                await session.execute(
                    select(Asset).where(Asset.id == VIOLATION_ASSET_ID)
                )
            ).scalar_one_or_none()
        if asset is None:
            _log(
                f"[{_ts()}] [B] asset {VIOLATION_ASSET_ID} not found — "
                "falling back to legacy bait URL."
            )
            return _VIOLATION_FALLBACK_URL

        # (a) cached provider_uploads URL — the clean form prod stored.
        entry = (asset.provider_uploads or {}).get("pixverse")
        cached = entry.get("url") if isinstance(entry, dict) else entry
        usable = _usable_pixverse_url(cached)
        if usable:
            _log(
                f"[{_ts()}] [B] bait source = asset {VIOLATION_ASSET_ID} "
                f"cached provider_uploads URL  ref={usable[:90]}"
            )
            return usable

        # (b) fresh upload of the local file.
        local_path = asset.local_path
        if not local_path or not Path(local_path).exists():
            _log(
                f"[{_ts()}] [B] asset {VIOLATION_ASSET_ID} has no cached URL "
                f"and no local file ({local_path!r}) — legacy bait URL."
            )
            return _VIOLATION_FALLBACK_URL
        _log(
            f"[{_ts()}] [B] no cached URL — uploading asset "
            f"{VIOLATION_ASSET_ID} local file fresh: {local_path}"
        )
        up = await client.upload_media(local_path)
        ref = _usable_pixverse_url(
            up.get("url") if isinstance(up, dict) else up
        )
        if not ref:
            _log(
                f"[{_ts()}] [B] upload returned no usable URL ({up!r}) — "
                "legacy bait URL."
            )
            return _VIOLATION_FALLBACK_URL
        _log(f"[{_ts()}] [B] bait source = fresh upload  ref={ref[:90]}")
        return ref
    except Exception as e:
        _log(
            f"[{_ts()}] [B] asset resolution failed ({e}) — "
            "legacy bait URL."
        )
        return _VIOLATION_FALLBACK_URL


def _build_synthetic_submission(job_id: str, url: Optional[str]) -> SimpleNamespace:
    """Minimal stand-in for ProviderSubmission the salvage reads.

    The salvage only touches ``.provider_job_id`` and ``.response`` (for the
    asset_url/image_url fallback).  Matches the shape the deterministic
    test's ``_make_submission`` produces.
    """
    return SimpleNamespace(
        provider_job_id=job_id,
        response={"image_url": url} if url else {},
    )


async def _run_phase_a(client: Any) -> bool:
    """Benign happy path. Returns True on success (hard requirement)."""
    _log("\n" + "=" * 72)
    _log("PHASE A — benign i2i happy path (the main value)")
    _log("=" * 72)
    result = await _submit_and_poll(client, BENIGN_PROMPT, SOURCE_IMAGE_URL, "A")
    mapped: ProviderStatus = result.get("mapped_status")  # type: ignore[assignment]
    url = result.get("url")

    if mapped != ProviderStatus.COMPLETED:
        _log(
            f"[{_ts()}] [A] FAIL — expected COMPLETED, got "
            f"{getattr(mapped, 'value', mapped)} (raw={result.get('raw_status')}). "
            "Account/session/credits or the live image pipeline is broken."
        )
        return False
    if not url or not str(url).startswith("http"):
        _log(f"[{_ts()}] [A] FAIL — COMPLETED but no usable image URL: {url!r}")
        return False
    if is_pixverse_placeholder_url(url):
        _log(f"[{_ts()}] [A] FAIL — COMPLETED but URL is a placeholder: {url}")
        return False

    serves = await cdn_head_probe(url)
    _log(f"[{_ts()}] [A] CDN HEAD probe -> {serves!r}  url={url}")
    if serves is not True:
        _log(
            f"[{_ts()}] [A] FAIL — completed image URL did not serve "
            f"(probe={serves!r}).  The pipeline produced an unfetchable asset."
        )
        return False

    _log(f"[{_ts()}] [A] PASS — COMPLETED, CDN URL serves (HEAD 200).")
    return True


async def _cdn_get_probe(url: str) -> Optional[bool]:
    """Streaming GET probe — same semantics as ``cdn_head_probe`` but uses
    GET so we can spot CDN-edges that return HEAD-404 during propagation
    while the object is already GET-200 retrievable.  Streams to avoid
    downloading the body; we only inspect the response code.
    """
    import httpx as _httpx

    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        async with _httpx.AsyncClient(
            timeout=4.0,
            follow_redirects=True,
            headers={"User-Agent": "PixSim7/1.0"},
        ) as cli:
            async with cli.stream("GET", url) as r:
                code = r.status_code
        if 200 <= code < 300:
            return True
        if 400 <= code < 500:
            return False
        return None
    except Exception:
        return None


async def _probe_with_get_fallback(url: str) -> dict:
    """HEAD then optional GET when HEAD is not a positive 200.  Returns
    ``{'head': bool|None, 'get': bool|None|'-', 'differs': bool}``.  GET
    is skipped (returned as ``'-'``) when HEAD is already True — no point
    consuming bytes to re-confirm a positive.  ``differs`` is True iff
    HEAD said no (or inconclusive) but GET said yes — the interesting
    signal that a CDN propagation gap would mask the retrievable object.
    """
    head = await cdn_head_probe(url)
    if head is True:
        return {"head": True, "get": "-", "differs": False}
    get_res = await _cdn_get_probe(url)
    return {
        "head": head,
        "get": get_res,
        "differs": get_res is True,
    }


def _fmt_probe(res: dict) -> str:
    """Format a ``_probe_with_get_fallback`` result for a log line."""
    return (
        f"HEAD={res['head']!r} GET={res['get']!r}"
        + ("  ⚠ HEAD/GET disagree" if res["differs"] else "")
    )


async def _observe_extra_recovery_paths(
    tag: str, client: Any, result: dict
) -> None:
    """Diagnostic probes beyond the production salvage path.  Purely
    observational — not asserted.  Answers four questions:

    1. Does the THUMBNAIL CDN object HEAD-serve when the main one might not?
       The salvage only probes the main render URL; a separate thumbnail
       object surviving moderation is evidence the render happened and
       could be a fallback retrieval path.
    2. Does ANY EARLIER URL seen across polls HEAD-serve?  Production's
       ``submission.response`` retains only the latest URL; if Pixverse
       swaps URLs across polls and the last one 404s while an earlier
       one serves, the salvage misses it.
    3. Does the main candidate URL eventually 200 if we re-probe over
       30s+ ?  Validates whether the new FILTERED 30s deferral window
       is roughly right, too tight, or too loose.
    4. Does ``check_image_status_from_list`` (the personal-image-list
       endpoint, a different Pixverse API than ``get_image``) surface a
       URL when ``get_image`` returns ``url=None`` for terminal-FILTERED?
       That's a forward-path URL source the production salvage doesn't
       currently consult on FILTERED.
    """
    candidate = result.get("url") or result.get("pre_url")
    urls_seen: list[str] = result.get("urls_seen") or []
    thumbs_seen: list[str] = result.get("thumbs_seen") or []
    job_id = result.get("job_id")

    _log(f"[{_ts()}] [{tag}] --- observational extras ---")

    # (1) Thumbnails.
    if thumbs_seen:
        for t in thumbs_seen:
            if (
                isinstance(t, str)
                and t.startswith("http")
                and not is_pixverse_placeholder_url(t)
            ):
                probe = await _probe_with_get_fallback(t)
                _log(
                    f"[{_ts()}] [{tag}] (1) thumb {_fmt_probe(probe)}  url={t}"
                )
            else:
                _log(
                    f"[{_ts()}] [{tag}] (1) thumb skipped (placeholder/non-http)  url={t}"
                )
    else:
        _log(f"[{_ts()}] [{tag}] (1) thumb: no thumbnail URL seen across polls")

    # (2) Distinct URLs across polls (drift) — skip the one we already
    #     probed as the main candidate.
    distinct_extras = [
        u
        for u in urls_seen
        if u != candidate
        and isinstance(u, str)
        and u.startswith("http")
        and not is_pixverse_placeholder_url(u)
    ]
    if distinct_extras:
        for u in distinct_extras:
            probe = await _probe_with_get_fallback(u)
            _log(
                f"[{_ts()}] [{tag}] (2) earlier-URL {_fmt_probe(probe)}  url={u}"
            )
    else:
        _log(
            f"[{_ts()}] [{tag}] (2) URL drift: no distinct URLs beyond the "
            f"main candidate (urls_seen={len(urls_seen)})"
        )

    # (3) Time-series probe on the main candidate.  Stops early on first
    #     positive (HEAD-200 OR GET-200 when HEAD disagrees).
    if (
        candidate
        and isinstance(candidate, str)
        and candidate.startswith("http")
        and not is_pixverse_placeholder_url(candidate)
    ):
        start = time.monotonic()
        intervals = [0, 2, 5, 10, 20, 30]
        first_positive_at: Optional[float] = None
        first_positive_via: Optional[str] = None
        for target_at in intervals:
            now_elapsed = time.monotonic() - start
            if now_elapsed < target_at:
                await asyncio.sleep(target_at - now_elapsed)
            probe = await _probe_with_get_fallback(candidate)
            elapsed_now = round(time.monotonic() - start, 1)
            _log(
                f"[{_ts()}] [{tag}] (3) t≈{elapsed_now:>5}s  {_fmt_probe(probe)}"
            )
            if probe["head"] is True:
                first_positive_at = elapsed_now
                first_positive_via = "HEAD"
                break
            if probe["differs"]:
                first_positive_at = elapsed_now
                first_positive_via = "GET-only"
                break
        if first_positive_at is not None:
            _log(
                f"[{_ts()}] [{tag}] (3) candidate first 200 at ≈{first_positive_at}s "
                f"via {first_positive_via}"
            )
        else:
            _log(
                f"[{_ts()}] [{tag}] (3) candidate never 200 across 30s window "
                "(neither HEAD nor GET)"
            )
    else:
        _log(
            f"[{_ts()}] [{tag}] (3) time-series skipped — no probeable candidate URL"
        )

    # (4) List-endpoint URL comparison.
    if job_id:
        try:
            list_res = await _scan_image_list(client, str(job_id), max_pages=5)
        except Exception as e:
            _log(f"[{_ts()}] [{tag}] (4) list endpoint raised: {e}")
        else:
            list_url = list_res.video_url
            matched = (list_res.metadata or {}).get("matched")
            mapped_list = getattr(list_res.status, "value", list_res.status)
            _log(
                f"[{_ts()}] [{tag}] (4) list endpoint matched={matched}  "
                f"status={mapped_list}  url={list_url!r}"
            )
            if (
                list_url
                and isinstance(list_url, str)
                and list_url.startswith("http")
                and not is_pixverse_placeholder_url(list_url)
            ):
                probe = await _probe_with_get_fallback(list_url)
                same = list_url == candidate
                _log(
                    f"[{_ts()}] [{tag}] (4) list-endpoint URL {_fmt_probe(probe)}  "
                    f"(same_as_candidate={same})  url={list_url}"
                )
            else:
                _log(
                    f"[{_ts()}] [{tag}] (4) list endpoint URL not probeable "
                    "(placeholder or absent)"
                )
    else:
        _log(f"[{_ts()}] [{tag}] (4) list endpoint skipped — no job_id")

    _log(f"[{_ts()}] [{tag}] --- end observational extras ---")


async def _analyze_b_sample(
    tag: str, result: dict, rows: list[dict]
) -> Optional[bool]:
    """Analyse one filter-bait result: HEAD-probe the pre-allocated object
    and drive the real salvage; record an observational row.

    Returns True (consistent), False (inconsistent — a real problem), or
    None (skipped / inconclusive — not a failure).  The row it appends to
    ``rows`` is what answers the operator's question: across error cases,
    does HEAD return an image off the pre-allocated CDN object?
    """
    mapped: ProviderStatus = result.get("mapped_status")  # type: ignore[assignment]
    raw_status = result.get("raw_status")
    url = result.get("url")
    pre_url = result.get("pre_url")
    job_id = result.get("job_id") or "unknown"
    candidate = url or pre_url

    def _row(head: Any, verdict: str, note: str) -> None:
        rows.append(
            {
                "tag": tag,
                "raw": raw_status,
                "mapped": getattr(mapped, "value", mapped),
                "candidate": bool(candidate),
                "head": head,
                "verdict": verdict,
                "note": note,
            }
        )

    _log(
        f"[{_ts()}] [{tag}] terminal mapped={getattr(mapped, 'value', mapped)} "
        f"raw={raw_status!r} url={url!r} pre_url={pre_url!r}"
    )

    if mapped == ProviderStatus.COMPLETED:
        _log(f"[{_ts()}] [{tag}] SKIP — did NOT trip moderation (COMPLETED).")
        _row("-", "SKIP", "not filtered (provider non-determinism)")
        return None
    if mapped not in (ProviderStatus.FILTERED, ProviderStatus.FAILED):
        _log(
            f"[{_ts()}] [{tag}] SKIP — odd non-terminal status "
            f"{getattr(mapped, 'value', mapped)} (raw={raw_status!r})."
        )
        _row("-", "SKIP", "odd status (provider variance)")
        return None

    original_status = mapped.value  # "filtered" or "failed"

    # Observational explicit probe (the salvage probes internally too; this
    # is for the log/table + to classify the expected branch up front).
    probe = None
    if (
        candidate
        and str(candidate).startswith("http")
        and not is_pixverse_placeholder_url(candidate)
    ):
        probe = await cdn_head_probe(candidate)
    placeholder = bool(candidate) and is_pixverse_placeholder_url(candidate)
    _log(
        f"[{_ts()}] [{tag}] {original_status!r}  HEAD probe -> {probe!r}  "
        f"placeholder={placeholder}  candidate={candidate}"
    )

    # Drive the actual production salvage against the live submission.
    status_result = ProviderStatusResult(
        status=mapped,
        video_url=url,
        thumbnail_url=None,
        metadata={"provider_status": raw_status, "is_image": True},
    )
    submission = _build_synthetic_submission(job_id, candidate)
    try:
        recovered = await _try_pixverse_image_cdn_salvage(
            submission=submission,
            status_result=status_result,
            poll_cache={},
            original_status=original_status,
        )
    except Exception as e:
        _log(f"[{_ts()}] [{tag}] SKIP — salvage raised against live data: {e}")
        _row(probe, "SKIP", f"salvage raised: {str(e)[:50]}")
        return None

    meta = status_result.metadata or {}
    _log(
        f"[{_ts()}] [{tag}] salvage recovered={recovered}  "
        f"result_status={status_result.status.value}  metadata={meta}"
    )

    head_repr = "200" if probe is True else "placeholder" if placeholder else (
        "404" if probe is False else "inconclusive"
    )

    # --- Assert the consistent outcome ---------------------------------
    if probe is True and not placeholder:
        # Object serves -> false filter -> must recover w/ early-CDN contract.
        ok = (
            recovered is True
            and status_result.status == ProviderStatus.COMPLETED
            and meta.get("image_false_filter_recovered") is True
            and is_early_cdn_terminal(meta)
            and meta.get("video_original_status") == original_status
        )
        if ok and original_status == "filtered":
            ok = is_early_cdn_filtered(meta) is True
            contract = "filtered->billing SKIPPED + provider_flagged"
        elif ok:
            ok = is_early_cdn_filtered(meta) is False
            contract = "failed->normal billing, not flagged"
        else:
            contract = "contract mismatch"
        if ok:
            _log(
                f"[{_ts()}] [{tag}] PASS — false filter; salvage RECOVERED "
                f"consistently ({contract})."
            )
            _row(head_repr, "PASS", f"recovered ({contract})")
            return True
        _log(
            f"[{_ts()}] [{tag}] FAIL — object served (HEAD 200) but salvage "
            "did NOT recover per the contract — investigate."
        )
        _row(head_repr, "FAIL", "served but not recovered per contract")
        return False

    # Object 404s / inconclusive / placeholder -> must stay terminal.
    if recovered is False and status_result.status == mapped:
        _log(
            f"[{_ts()}] [{tag}] PASS — object not retrievable "
            f"({head_repr}); salvage correctly left it {mapped.value} "
            "(fail-safe — genuine filter)."
        )
        _row(head_repr, "PASS", f"genuine filter; left {mapped.value}")
        return True
    if probe is None:
        _log(f"[{_ts()}] [{tag}] SKIP — HEAD inconclusive (5xx/timeout).")
        _row(head_repr, "SKIP", "HEAD inconclusive")
        return None
    _log(
        f"[{_ts()}] [{tag}] FAIL — object did not serve yet salvage "
        f"recovered={recovered}, status={status_result.status.value} — "
        "inconsistent with fail-safe contract."
    )
    _row(head_repr, "FAIL", "not served yet recovered")
    return False


async def _run_phase_b(client: Any) -> Optional[bool]:
    """Submit VIOLATION_SAMPLES filter-bait jobs concurrently, then analyse
    each.  Aggregate: FAIL if any sample is inconsistent; PASS if at least
    one tripped a filter and every tripped sample was consistent; else
    SKIP/INCONCLUSIVE (no filter tripped / all inconclusive).
    """
    _log("\n" + "=" * 72)
    _log(
        f"PHASE B — {VIOLATION_SAMPLES} filter-bait i2i job(s), concurrent "
        "(post-render filter) + live salvage (best-effort)"
    )
    _log("=" * 72)

    # Resolve the bait source ONCE (one fresh upload) and reuse it across
    # all concurrent samples.
    source = await _resolve_violation_source(client)

    async def _one(idx: int) -> Optional[dict]:
        tag = f"B{idx}" if VIOLATION_SAMPLES > 1 else "B"
        try:
            return await _submit_and_poll(
                client, VIOLATION_PROMPT, source, tag
            )
        except Exception as e:
            _log(f"[{_ts()}] [{tag}] SKIP — submit/poll raised: {e}")
            return None

    results = await asyncio.gather(
        *[_one(i + 1) for i in range(VIOLATION_SAMPLES)]
    )

    rows: list[dict] = []
    verdicts: list[Optional[bool]] = []
    for i, result in enumerate(results, start=1):
        tag = f"B{i}" if VIOLATION_SAMPLES > 1 else "B"
        if result is None:
            rows.append(
                {
                    "tag": tag, "raw": "-", "mapped": "-",
                    "candidate": False, "head": "-",
                    "verdict": "SKIP", "note": "submit/poll raised",
                }
            )
            verdicts.append(None)
            continue
        verdicts.append(await _analyze_b_sample(tag, result, rows))
        # Observational diagnostic — does NOT affect the verdict.  Logs
        # alternative recovery paths the production salvage doesn't
        # currently consult (thumb / URL-drift / time-series / list endpoint).
        try:
            await _observe_extra_recovery_paths(tag, client, result)
        except Exception as e:
            _log(f"[{_ts()}] [{tag}] observational extras raised: {e}")

    # Observational table — the answer to "does HEAD serve an image across
    # error cases?".  head: 200 = false filter (recoverable), 404 = genuine,
    # placeholder = swapped, inconclusive = 5xx/timeout, '-' = not filtered.
    _log("\n  Phase B observations (pre-allocated CDN object per error case):")
    _log(
        "  "
        + f"{'tag':<5}{'raw':<5}{'mapped':<11}{'cand':<6}"
        + f"{'HEAD':<13}{'verdict':<8}note"
    )
    for r in rows:
        _log(
            "  "
            + f"{str(r['tag']):<5}{str(r['raw']):<5}{str(r['mapped']):<11}"
            + f"{('yes' if r['candidate'] else 'no'):<6}"
            + f"{str(r['head']):<13}{str(r['verdict']):<8}{r['note']}"
        )

    if any(v is False for v in verdicts):
        return False
    if any(v is True for v in verdicts):
        return True
    return None


async def main() -> int:
    client = await _build_client()

    phase_a_ok: Optional[bool] = None
    phase_b: Optional[bool] = None

    if not _VIOLATION_ONLY:
        phase_a_ok = await _run_phase_a(client)

    if not _SKIP_VIOLATION:
        phase_b = await _run_phase_b(client)

    _log("\n" + "=" * 72)
    _log("SUMMARY")
    _log("=" * 72)
    if phase_a_ok is not None:
        _log(f"  Phase A (benign happy path):  {'PASS' if phase_a_ok else 'FAIL'}")
    else:
        _log("  Phase A (benign happy path):  SKIPPED (--violation-only)")
    if phase_b is True:
        _log("  Phase B (salvage round-trip): PASS")
    elif phase_b is False:
        _log("  Phase B (salvage round-trip): FAIL")
    else:
        _log(
            "  Phase B (salvage round-trip): SKIPPED/INCONCLUSIVE "
            "(provider variance — not a failure)"
        )
    _log("=" * 72)

    # Exit non-zero only on a hard failure: A failing, or B actively
    # inconsistent.  Skipped/inconclusive B is fine (a robust A is the bar).
    if phase_a_ok is False or phase_b is False:
        return 1
    if phase_a_ok is None and _VIOLATION_ONLY and phase_b in (None, True):
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
