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
        use_browser_fallback: bool = False,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, object]:
        """
        Login to Pixverse using direct Web API (fast, lightweight).

        Args:
            email: Pixverse account email/username
            password: Pixverse password
            use_browser_fallback: If True, use browser automation fallback (slow, for initial login)
            headless: Whether to run browser headless for fallback (only if use_browser_fallback=True)
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
            if use_browser_fallback:
                # Heavy: Web API + Playwright fallback (for initial/manual login)
                session = await loop.run_in_executor(
                    _executor,
                    lambda: PixverseAuth().login_with_browser_fallback(
                        email,
                        password,
                        headless=headless,
                        timeout_ms=timeout_ms,
                    ),
                )
            else:
                # Lightweight: Direct Web API only (for auto-reauth)
                session = await loop.run_in_executor(
                    _executor,
                    lambda: PixverseAuth().login(
                        email,
                        password,
                    ),
                )
            return session
        except Exception as exc:
            logger.error("Pixverse login failed", exc_info=True)
            raise PixverseAuthError(f"Pixverse login failed: {exc}") from exc

    async def login_with_google_id_token(
        self,
        id_token: str,
    ) -> Dict[str, object]:
        """
        Login to Pixverse using a Google ID token (OAuth auto_login).

        This exchanges the Google ID token for a Pixverse JWT and cookies
        via pixverse-py's google_id_token helper.
        """
        try:
            from pixverse.auth import PixverseAuth  # type: ignore
        except ImportError as exc:
            raise PixverseAuthError("pixverse-py not installed") from exc

        loop = asyncio.get_event_loop()
        try:
            session = await loop.run_in_executor(
                _executor,
                lambda: PixverseAuth().login_with_google_id_token(id_token),
            )
            return session
        except Exception as exc:
            logger.error("Pixverse Google ID token login failed", exc_info=True)
            raise PixverseAuthError(f"Pixverse Google ID token login failed: {exc}") from exc
