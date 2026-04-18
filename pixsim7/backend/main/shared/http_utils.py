"""
HTTP utilities for downloading arbitrary URLs to temp files.

Canonical path for "download this URL to a temp file with retries".
Callers that hold an Asset (services/asset/sync.py::_download_asset_to_temp)
and callers that hold only a raw URL (services/asset/frame_extractor.py::
download_native_last_frame) both route through here so retry semantics,
timeout, and error shape stay consistent.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from typing import Optional

import httpx

from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim_logging import get_logger

logger = get_logger()


async def download_url_to_temp(
    url: str,
    *,
    suffix: str = "",
    prefix: str = "dl_",
    timeout: float = 60.0,
    max_retries: int = 3,
    initial_retry_delay: float = 2.0,
    log_context: Optional[dict] = None,
) -> str:
    """
    Download a URL to a fresh temp file with retry-on-transient-failure.

    Retries only on `httpx.TimeoutException` / `httpx.NetworkError` with
    exponential backoff (initial_retry_delay, doubling each attempt). HTTP
    status errors (4xx/5xx) and other exceptions fail fast. On final
    failure the temp file is removed and `InvalidOperationError` is raised.

    Args:
        url: Fully-qualified http(s) URL to download.
        suffix: Temp file suffix including leading dot (e.g. ".jpg").
        prefix: Temp file prefix.
        timeout: Per-attempt httpx timeout in seconds.
        max_retries: Total attempts including the first.
        initial_retry_delay: First backoff delay; doubled each retry.
        log_context: Optional dict merged into retry log lines (e.g.
            `{"asset_id": 42}`) so callers can tag their own identifiers.

    Returns:
        Absolute path to the temp file. Caller owns cleanup.
    """
    fd, temp_path = tempfile.mkstemp(suffix=suffix, prefix=prefix)
    os.close(fd)

    extra = dict(log_context or {})

    try:
        retry_delay = initial_retry_delay
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    response = await client.get(url)
                    response.raise_for_status()
                    with open(temp_path, "wb") as f:
                        f.write(response.content)
                break
            except (httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        "url_download_retry",
                        url=url[:120],
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        error=str(e),
                        **extra,
                    )
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    raise

        if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
            raise InvalidOperationError("Downloaded file is empty")

        return temp_path

    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError as cleanup_error:
                logger.warning(
                    "url_download_cleanup_failed",
                    file_path=temp_path,
                    error=str(cleanup_error),
                )

        if isinstance(e, InvalidOperationError):
            raise
        raise InvalidOperationError(f"Failed to download {url[:120]}: {e}") from e
