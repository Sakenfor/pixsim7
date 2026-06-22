"""Periodic refresh of logging config from the backend.

The AI client treats ``/api/v1/admin/logging/config`` as the source of truth
for global log level, per-domain overrides, and DB ingestion floor. We pull
on startup and on a periodic interval; failures are best-effort and the next
tick retries.

The bridge already has authenticated HTTP capability (httpx + stored login
token) and a long-lived WebSocket to the backend; this module piggybacks on
the former. A future enhancement can plug ``refresh_now()`` into the WS
message dispatcher so a backend ``system_config:reloaded`` push triggers
sub-second reapply.
"""
from __future__ import annotations

import asyncio
from typing import Callable, Optional
from urllib.parse import urlparse

import httpx

from pixsim_logging import get_logger
from pixsim_logging.domains import update_domain_config, update_global_level

logger = get_logger()


_DEFAULT_INTERVAL = 60.0
_HTTP_TIMEOUT = 5.0


def _ws_to_http(ws_url: str) -> str:
    """Convert ws://host:port/path → http://host:port (path stripped)."""
    parsed = urlparse(ws_url)
    scheme = "https" if parsed.scheme == "wss" else "http"
    netloc = parsed.netloc or "localhost:8000"
    return f"{scheme}://{netloc}"


def _apply_config(data: dict) -> None:
    """Apply a logging config dict to in-memory pixsim_logging state."""
    if "log_level" in data and data["log_level"]:
        update_global_level(data["log_level"])
    if "log_domain_levels" in data:
        update_domain_config(data.get("log_domain_levels") or {})
    if "log_db_min_level" in data and data["log_db_min_level"]:
        try:
            from pixsim_logging.config import set_db_min_level
            set_db_min_level(data["log_db_min_level"])
        except Exception:
            pass  # not all installations support DB ingestion


async def _fetch_and_apply(http_base: str, token: Optional[str]) -> bool:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{http_base}/api/v1/admin/logging/config",
                headers=headers,
            )
        if resp.status_code != 200:
            logger.debug(
                "client_logging_config_fetch_non_200",
                source=http_base,
                status_code=resp.status_code,
            )
            return False
        _apply_config(resp.json())
        return True
    except Exception as e:
        logger.debug(
            "client_logging_config_fetch_failed",
            source=http_base,
            error_type=type(e).__name__,
            error=str(e),
        )
        return False


class LoggingRefresher:
    """Background task: periodically pull global logging config from backend."""

    def __init__(
        self,
        ws_url: str,
        get_token: Callable[[], Optional[str]],
        interval: float = _DEFAULT_INTERVAL,
    ) -> None:
        self._http_base = _ws_to_http(ws_url)
        self._get_token = get_token  # late lookup so token refreshes are picked up
        self._interval = interval
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        """Initial fetch (sync within startup) + spawn periodic loop."""
        ok = await _fetch_and_apply(self._http_base, self._get_token())
        if ok:
            logger.info("client_logging_config_loaded", source=self._http_base)
        else:
            logger.info(
                "client_logging_config_load_skipped",
                source=self._http_base,
                reason="no_token_or_unreachable",
            )
        self._task = asyncio.create_task(self._loop(), name="logging-refresher")

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._interval)
                return  # stop fired
            except asyncio.TimeoutError:
                pass
            await _fetch_and_apply(self._http_base, self._get_token())

    async def refresh_now(self) -> None:
        """Trigger an immediate refresh outside the periodic loop."""
        await _fetch_and_apply(self._http_base, self._get_token())

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
