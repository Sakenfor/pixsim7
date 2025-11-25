"""
Pixverse automated authentication.

Allows refreshing Pixverse JWT/cookies server-side (useful for headless re-auth flows).
Delegates to pixverse-py for API + Playwright login.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict
import structlog

logger = structlog.get_logger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pixverse-auth")


class PixverseAuthError(Exception):
    """Raised when Pixverse authentication fails."""


class PixverseAuthService:
    """
    Thin wrapper around pixverse-py authentication helpers.

    Usage:
        async with PixverseAuthService() as auth:
            session = await auth.login_with_password(email, password)
    """

    def __init__(self) -> None:
        pass

    async def __aenter__(self) -> "PixverseAuthService":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        pass

    async def cleanup(self) -> None:
        """No-op cleanup hook for compatibility."""
        pass

    async def login_with_password(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, object]:
        """
        Login to Pixverse using pixverse-py (Web API first, Playwright fallback).

        Args:
            email: Pixverse account email/username
            password: Pixverse password
            headless: Whether to run browser headless for fallback
            timeout_ms: Timeout in milliseconds for browser fallback

        Returns:
            Session data with jwt_token, cookies, and basic account info.

        Raises:
            PixverseAuthError: on login failure
        """
        try:
            from pixverse.auth import PixverseAuth  # type: ignore
        except ImportError as exc:
            raise PixverseAuthError("pixverse-py not installed") from exc

        loop = asyncio.get_event_loop()
        try:
            session = await loop.run_in_executor(
                _executor,
                lambda: PixverseAuth().login_with_browser_fallback(
                    email,
                    password,
                    headless=headless,
                    timeout_ms=timeout_ms,
                ),
            )
            return session
        except Exception as exc:
            logger.error("Pixverse login failed", exc_info=True)
            raise PixverseAuthError(f"Pixverse login failed: {exc}") from exc
