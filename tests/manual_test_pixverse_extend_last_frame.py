"""Manual real-account test: verify last_frame_url plumbing for Pixverse
OpenAPI extend.

Two modes:

* **Default (#1)** — submits ONE extend with ``last_frame_url`` set explicitly,
  captures the raw request payload Pixverse receives, polls to terminal,
  prints the final video URL so you can eyeball the first frame.

* **``--ab`` flag (#2)** — submits TWO extends in parallel on the same source
  with the same prompt/seed: one WITH ``last_frame_url`` (dict form), one
  WITHOUT (legacy ``video_id:<id>`` string form).  Both polled concurrently,
  both URLs printed for side-by-side comparison.

Usage::

    python tests/manual_test_pixverse_extend_last_frame.py <key> asset:64120
    python tests/manual_test_pixverse_extend_last_frame.py <key> video:397860497606102
    python tests/manual_test_pixverse_extend_last_frame.py <key> asset:64120 "custom prompt"
    python tests/manual_test_pixverse_extend_last_frame.py <key> asset:64120 "prompt" --ab

Env fallbacks: ``PIXVERSE_OPENAPI_KEY`` and ``PIXVERSE_PROMPT``.

A/B mode costs two extend credits; default mode costs one.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Allow running as a plain script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from pixverse import PixverseClient, GenerationOptions
from pixverse.accounts import AccountPool

# ── Args ────────────────────────────────────────────────────────────────

AB_MODE = "--ab" in sys.argv
if AB_MODE:
    sys.argv = [a for a in sys.argv if a != "--ab"]

DEFAULT_PROMPT = "scene continues in same style how it looks like is"
MODEL = "v6"
QUALITY = "360p"
DURATION = 5
POLL_INTERVAL_SEC = 2.0
MAX_POLL_MINUTES = 6


def _resolve_openapi_key() -> str:
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        return sys.argv[1].strip()
    env_val = os.environ.get("PIXVERSE_OPENAPI_KEY", "").strip()
    if env_val:
        return env_val
    sys.exit(
        "OpenAPI key required. Pass it as the first argument or set "
        "PIXVERSE_OPENAPI_KEY in the env."
    )


def _resolve_source_spec() -> str:
    if len(sys.argv) >= 3 and sys.argv[2].strip():
        return sys.argv[2].strip()
    sys.exit(
        "Source spec required as second arg: 'asset:<N>' or 'video:<id>'."
    )


def _resolve_prompt() -> str:
    if len(sys.argv) >= 4 and sys.argv[3].strip():
        return sys.argv[3].strip()
    env_val = os.environ.get("PIXVERSE_PROMPT", "").strip()
    if env_val:
        return env_val
    return DEFAULT_PROMPT


OPENAPI_KEY = _resolve_openapi_key()
SOURCE_SPEC = _resolve_source_spec()
PROMPT = _resolve_prompt()


# ── Helpers ─────────────────────────────────────────────────────────────


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


def _build_openapi_account_dict() -> dict:
    return {
        "email": "openapi-test",
        "password": None,
        "session": {
            "openapi_key": OPENAPI_KEY,
            "use_method": "open-api",
        },
    }


async def _resolve_source_video_id(spec: str) -> str:
    """Turn 'asset:<N>' / 'video:<id>' / bare digit into a Pixverse video_id."""
    if spec.startswith("video:"):
        rest = spec.split(":", 1)[1].strip()
        if not rest:
            sys.exit("video: spec missing an id")
        return rest
    if spec.startswith("asset:"):
        inner = spec.split(":", 1)[1].strip()
        if not inner.isdigit():
            sys.exit(f"asset: spec requires numeric id, got '{inner}'")
        asset_id = int(inner)
        from pixsim7.backend.main.domain import Asset
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from sqlalchemy import select

        async with get_async_session() as session:
            row = (
                await session.execute(select(Asset).where(Asset.id == asset_id))
            ).scalar_one_or_none()
            if not row:
                sys.exit(f"Asset {asset_id} not found in pixsim7 DB")
            paid = str(getattr(row, "provider_asset_id", "") or "").strip()
            if paid.isdigit():
                return paid
            pu = (row.provider_uploads or {}).get("pixverse")
            if isinstance(pu, dict):
                pu = pu.get("id")
            if isinstance(pu, str) and pu.isdigit():
                return pu
            sys.exit(
                f"Asset {asset_id} has no Pixverse video_id "
                "(provider_asset_id / provider_uploads['pixverse'] empty)."
            )
    if spec.isdigit():
        return spec
    sys.exit(f"Bad source spec '{spec}' — use asset:<N> or video:<id>.")


async def _fetch_source_thumb(client: PixverseClient, video_id: str) -> Optional[str]:
    """Pull the source video's rendered last-frame URL (.thumbnail on SDK)."""
    try:
        video = await client.get_video(video_id=video_id)
    except Exception as e:
        sys.exit(f"get_video({video_id}) failed: {e}")
    url = getattr(video, "thumbnail", None)
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return None
    return url


def _install_request_capture(client: PixverseClient, label: str, sink: dict) -> Any:
    """Monkey-patch client.api._request to record payload for extend calls.

    Returns the original method so the caller can restore it.  Every call to
    /video/extend (OpenAPI or WebAPI) is captured into sink[label].
    """
    orig = client.api._request

    async def _capture(method: str, endpoint: str, *args: Any, **kwargs: Any):
        if "extend" in endpoint:
            sink[label] = {
                "method": method,
                "endpoint": endpoint,
                "payload": kwargs.get("json"),
                "ts": _ts(),
            }
        return await orig(method, endpoint, *args, **kwargs)

    client.api._request = _capture
    return orig


async def _submit_extend(
    client: PixverseClient,
    sdk_account: Any,
    source_video_id: str,
    last_frame_url: Optional[str],
    prompt: str,
    label: str,
    captured: dict,
) -> str:
    """Submit one extend; returns the new video_id."""
    if last_frame_url:
        video_arg: Any = {
            "original_video_id": source_video_id,
            "last_frame_url": last_frame_url,
        }
    else:
        video_arg = f"video_id:{source_video_id}"

    orig = _install_request_capture(client, label, captured)
    try:
        video = await client.api.extend_video(
            video_url=video_arg,
            prompt=prompt,
            options=GenerationOptions(
                model=MODEL,
                quality=QUALITY,
                duration=DURATION,
            ),
            account=sdk_account,
        )
    finally:
        client.api._request = orig
    new_id = str(getattr(video, "id", "") or "")
    if not new_id:
        raise RuntimeError(f"[{label}] extend response missing video id")
    return new_id


async def _poll_until_terminal(
    client: PixverseClient, video_id: str, label: str
) -> Any:
    """Poll get_video until status is terminal (completed / filtered / failed).

    Returns the final Video object, or None on timeout.
    """
    deadline = time.monotonic() + MAX_POLL_MINUTES * 60
    last_status: Optional[str] = None
    while time.monotonic() < deadline:
        await asyncio.sleep(POLL_INTERVAL_SEC)
        try:
            v = await client.get_video(video_id=video_id)
        except Exception as e:
            print(f"[{_ts()}] [{label}] get_video error: {e}")
            continue
        status = getattr(v, "status", None)
        if status != last_status:
            print(f"[{_ts()}] [{label}] status={status}")
            last_status = status
        if status in ("completed", "filtered", "failed"):
            return v
    print(f"[{_ts()}] [{label}] timed out after {MAX_POLL_MINUTES}min")
    return None


def _dump_payload(label: str, entry: dict) -> None:
    print(f"\n--- [{label}] payload sent to Pixverse ---")
    print(f"  endpoint: {entry.get('endpoint')}")
    payload = entry.get("payload") or {}
    print("  body:")
    try:
        print(json.dumps(payload, indent=2))
    except Exception:
        print(repr(payload))
    has_last_frame = (
        isinstance(payload, dict)
        and "customer_video_last_frame_url" in payload
    )
    print(
        f"  customer_video_last_frame_url present: {has_last_frame}"
        + (
            f" (value: {payload.get('customer_video_last_frame_url')!r})"
            if has_last_frame
            else ""
        )
    )


def _dump_result(label: str, video: Any) -> None:
    print(f"\n--- [{label}] final video ---")
    if video is None:
        print("  (no result — timeout or error)")
        return
    for attr in ("id", "url", "status", "thumbnail"):
        print(f"  {attr}: {getattr(video, attr, None)}")


# ── Main ────────────────────────────────────────────────────────────────


async def main() -> None:
    print(f"[{_ts()}] Building OpenAPI-only client...")
    pool = AccountPool(accounts=[_build_openapi_account_dict()])
    client = PixverseClient(account_pool=pool)
    sdk_account = pool.accounts[0]

    print(f"[{_ts()}] Resolving source spec: {SOURCE_SPEC}")
    source_video_id = await _resolve_source_video_id(SOURCE_SPEC)
    print(f"[{_ts()}] Source video_id = {source_video_id}")

    print(f"[{_ts()}] Fetching source last-frame URL...")
    last_frame = await _fetch_source_thumb(client, source_video_id)
    if not last_frame:
        sys.exit(
            f"Source video {source_video_id} has no thumbnail/last-frame URL.\n"
            "Either the video isn't available on this account, or Pixverse "
            "didn't populate the thumbnail field."
        )
    print(f"[{_ts()}] last_frame_url = {last_frame}")

    captured: dict = {}

    if AB_MODE:
        print(f"\n[{_ts()}] === A/B MODE: 2 extends in parallel ===")
        with_id, without_id = await asyncio.gather(
            _submit_extend(client, sdk_account, source_video_id, last_frame,
                           PROMPT, "with_last_frame", captured),
            _submit_extend(client, sdk_account, source_video_id, None,
                           PROMPT, "without_last_frame", captured),
        )
        print(f"[{_ts()}] Submitted: with_last_frame={with_id} "
              f"without_last_frame={without_id}")

        _dump_payload("with_last_frame", captured.get("with_last_frame", {}))
        _dump_payload("without_last_frame", captured.get("without_last_frame", {}))

        with_result, without_result = await asyncio.gather(
            _poll_until_terminal(client, with_id, "with_last_frame"),
            _poll_until_terminal(client, without_id, "without_last_frame"),
        )
        _dump_result("with_last_frame", with_result)
        _dump_result("without_last_frame", without_result)

        print("\n--- Compare the first frames visually ---")
        for v, label in (
            (with_result, "with_last_frame"),
            (without_result, "without_last_frame"),
        ):
            url = getattr(v, "url", None) if v is not None else None
            print(f"  {label}: {url}")
        return

    # Default: single instrumented extend, with last_frame_url.
    print(f"\n[{_ts()}] === Single extend WITH last_frame_url ===")
    new_id = await _submit_extend(
        client, sdk_account, source_video_id, last_frame,
        PROMPT, "with_last_frame", captured,
    )
    print(f"[{_ts()}] Submitted: new_video_id={new_id}")

    _dump_payload("with_last_frame", captured.get("with_last_frame", {}))

    result = await _poll_until_terminal(client, new_id, "with_last_frame")
    _dump_result("with_last_frame", result)


if __name__ == "__main__":
    asyncio.run(main())
