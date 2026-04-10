"""
CDN probe — lightweight HEAD check for confirming media availability.

Used by the moderation recheck loop to skip provider API calls when the CDN
still serves the content (the common case: asset not flagged yet).
"""
from __future__ import annotations

import httpx

_HEAD_TIMEOUT_SEC = 4.0
_USER_AGENT = "PixSim7/1.0"


async def cdn_head_probe(url: str) -> bool | None:
    """
    Issue an HTTP HEAD to ``url`` and return whether the content is accessible.

    Returns:
        True   — 2xx response; content is up and served
        False  — 4xx response; content is gone or removed from CDN
        None   — 5xx, timeout, or connection error; state is inconclusive,
                 caller should fall back to the provider status API
    """
    if not url or not url.startswith(("http://", "https://")):
        return None
    try:
        async with httpx.AsyncClient(
            timeout=_HEAD_TIMEOUT_SEC,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            r = await client.head(url)
        if 200 <= r.status_code < 300:
            return True
        if 400 <= r.status_code < 500:
            return False
        return None  # 5xx or unexpected code — inconclusive
    except (httpx.TimeoutException, httpx.HTTPError, Exception):
        return None
