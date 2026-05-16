"""
Shared harness for the Pixverse *live* manual tests.

Underscore-prefixed and **not** a ``test_``/``manual_test_`` module, so
pytest never collects it.  It carries the parts the live manual scripts
were duplicating verbatim — credential/account acquisition, CLI-flag
parsing, timestamp/logging, URL classification — so each script stays thin
and a future "tests UI" has one place to consume.

Design constraints:
  - Scripts must remain runnable as plain files from the repo root.  When
    you ``python tests/<script>.py``, ``tests/`` is ``sys.path[0]`` so
    ``import _pixverse_live_harness`` resolves with no packaging.
  - Behaviour-preserving: ``log`` is injectable so a script with a rich
    dashboard (manual_test_early_cdn.py) can pass its own console-routed
    logger without this module forcing plain ``print``.
  - Nothing heavy at import time (safe to import from module scope).

Currently consumed by:
  - tests/manual_test_pixverse_image_salvage_live_manual.py
Designed so the two video early-CDN scripts can adopt it incrementally.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

# Repo-root on sys.path so ``pixsim7`` resolves even if a consumer imports
# this before adding it (consumers also do their own shim — harmless dup).
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from pixverse import PixverseClient

# Re-exported so scripts import URL helpers from one place.
from pixsim7.backend.main.services.provider.cdn_probe import cdn_head_probe
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    is_pixverse_placeholder_url,
    normalize_url,
)

__all__ = [
    "ts",
    "make_log",
    "pop_bool_flag",
    "pop_kv_flag",
    "resolve_webapi_creds",
    "build_client",
    "classify_url",
    "extract_media_fields",
    "cdn_head_probe",
    "is_pixverse_placeholder_url",
    "normalize_url",
]

Logger = Callable[..., None]


# ── time / logging ───────────────────────────────────────────────────────


def ts() -> str:
    """UTC ``HH:MM:SS.mmm`` — the timestamp format every live script uses."""
    return datetime.now(timezone.utc).strftime("%H:%M:%S.%f")[:-3]


def make_log() -> Logger:
    """Default plain-print logger.  A rich-dashboard script passes its own
    console-routed callable instead of using this."""

    def _log(*args: Any) -> None:
        print(" ".join(str(a) for a in args), flush=True)

    return _log


# ── CLI flag parsing (mutates sys.argv, like the original scripts) ───────


def pop_bool_flag(name: str) -> bool:
    """Return True and strip ``name`` from argv if present (e.g. --pretty)."""
    if name in sys.argv:
        sys.argv.remove(name)
        return True
    return False


def pop_kv_flag(prefix: str) -> Optional[str]:
    """Return the value of a ``--key=value`` flag and strip it from argv.

    Identical semantics to the per-script ``_pop_kv_flag`` it replaces.
    """
    for _i, _arg in enumerate(list(sys.argv[1:]), start=1):
        if _arg.startswith(prefix):
            value = _arg.split("=", 1)[1].strip() or None
            sys.argv.pop(_i)
            return value
    return None


# ── credential / account acquisition ─────────────────────────────────────
#
# This is the part the prompt for the image test called out as "the only
# non-obvious part" — kept identical to manual_test_early_cdn.py so the
# video script can adopt it without behaviour change.


def resolve_webapi_creds(
    *, default_email: str, default_password: str
) -> tuple[str, Optional[str], Optional[str]]:
    """Resolve (label, email, password), or (label, "__resolve_from_db__",
    None) when an ``account:<id>`` / numeric-env path should load a stored
    JWT session from the pixsim7 DB.

    Precedence (unchanged from the original scripts):
      1. argv[1] — ``account:<id>`` (DB) or ``email:password``.
      2. ``PIXVERSE_WEBAPI_ACCOUNT_ID`` env (numeric, DB).
      3. ``PIXVERSE_WEBAPI_EMAIL`` + ``PIXVERSE_WEBAPI_PASSWORD`` env.
      4. Hardcoded fallback the caller supplies.
    """
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
    return (default_email, default_email, default_password)


async def build_client(
    creds: tuple[str, Optional[str], Optional[str]],
    *,
    log: Optional[Logger] = None,
    want_openapi: bool = False,
) -> Any:
    """Build a ``PixverseClient`` from resolved creds.

    ``account:<id>`` mode loads the account from the pixsim7 DB and reuses
    its stored session (JWT + cookies) — no login roundtrip.  When
    ``want_openapi`` is set, the account's OpenAPI key (from
    ``api_keys``) is also wired into the web-api session so
    ``upload_media`` works (create/get still go via the JWT).

    Identical to manual_test_early_cdn.py._build_client except for the
    opt-in OpenAPI-key wiring (no-op when the flag is False).
    """
    log = log or make_log()
    label, email, password = creds
    if email == "__resolve_from_db__":
        from pixsim7.backend.main.domain.providers import ProviderAccount
        from pixsim7.backend.main.infrastructure.database.session import (
            get_async_session,
        )

        account_id = int(label.split(":", 1)[1])
        async with get_async_session() as session:
            acc = await session.get(ProviderAccount, account_id)
            if acc is None:
                sys.exit(f"ProviderAccount {account_id} not found in pixsim7 DB.")
            if acc.provider_id != "pixverse":
                sys.exit(
                    f"Account {account_id} is provider_id={acc.provider_id}, "
                    "not pixverse."
                )
            if not acc.jwt_token:
                sys.exit(
                    f"Account {account_id} ({acc.email}) has no JWT token — "
                    "can't use WebAPI without an active session.  Log in via "
                    "the app first, or pass email:password directly."
                )
            openapi_key = None
            if want_openapi:
                for k in acc.api_keys or []:
                    if isinstance(k, dict) and k.get("kind") == "openapi":
                        openapi_key = k.get("value")
                        break
            suffix = (
                f"  openapi_key={'yes' if openapi_key else 'no'}"
                if want_openapi
                else ""
            )
            log(
                f"[{ts()}] Using account:{account_id} ({acc.email}) from "
                f"pixsim7 DB.{suffix}"
            )
            sess: dict = {
                "jwt_token": acc.jwt_token,
                "cookies": acc.cookies or {},
                "use_method": "web-api",
            }
            if openapi_key:
                sess["openapi_key"] = openapi_key
            return PixverseClient(email=acc.email, session=sess)
    else:
        log(f"[{ts()}] Creating client for {email} (email+password login)...")
        return PixverseClient(email=email, password=password)


# ── URL classification / media-field extraction ──────────────────────────


def classify_url(url: Optional[str]) -> tuple[bool, bool, Optional[str]]:
    """(is_placeholder, is_retrievable, normalized) — the triple every
    early-CDN script computes off a candidate media URL."""
    if not url:
        return False, False, None
    # Imported lazily: only the video scripts need the retrievable check,
    # and keeping it here avoids a hard import for image-only consumers.
    from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
        has_retrievable_pixverse_media_url,
    )

    return (
        is_pixverse_placeholder_url(url),
        has_retrievable_pixverse_media_url(url),
        normalize_url(url),
    )


def extract_media_fields(payload: Any, *, kind: str) -> dict:
    """Extract ``raw_status`` / ``url`` (+thumb/dims) from a get_image or
    get_video payload, dict-or-object, mirroring the SDK's own key
    precedence.  ``kind`` is ``"image"`` or ``"video"``.
    """
    if payload is None:
        return {}
    is_image = kind == "image"
    if isinstance(payload, dict):
        if is_image:
            raw_status = (
                payload.get("image_status")
                if payload.get("image_status") is not None
                else payload.get("status")
            )
            url = (
                payload.get("image_url")
                or payload.get("url")
                or payload.get("asset_url")
            )
        else:
            raw_status = (
                payload.get("video_status")
                or payload.get("status")
            )
            url = payload.get("url") or payload.get("video_url")
        thumb = (
            payload.get("first_frame")
            or payload.get("thumbnail")
            or payload.get("thumbnail_url")
        )
        width = payload.get("output_width") or payload.get("width")
        height = payload.get("output_height") or payload.get("height")
    else:
        attr = "image_status" if is_image else "video_status"
        raw_status = getattr(payload, attr, None)
        if raw_status is None:
            raw_status = getattr(payload, "status", None)
        url = (
            getattr(payload, "image_url", None)
            or getattr(payload, "url", None)
            or getattr(payload, "video_url", None)
            or getattr(payload, "asset_url", None)
        )
        thumb = getattr(payload, "first_frame", None) or getattr(
            payload, "thumbnail", None
        )
        width = getattr(payload, "output_width", None) or getattr(
            payload, "width", None
        )
        height = getattr(payload, "output_height", None) or getattr(
            payload, "height", None
        )
    return {
        "raw_status": raw_status,
        "url": url,
        "thumb": thumb,
        "width": width,
        "height": height,
    }
