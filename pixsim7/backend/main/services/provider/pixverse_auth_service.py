"""
Pixverse automated authentication.

Allows refreshing Pixverse JWT/cookies server-side (useful for headless re-auth flows).
Uses direct API login when possible, falls back to Playwright if needed.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Dict
import httpx
import structlog

from pixsim7.backend.main.shared.config import settings

logger = structlog.get_logger(__name__)

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="playwright")


class PixverseAuthError(Exception):
    """Raised when Pixverse authentication fails."""


class PixverseAuthService:
    """
    Helper that automates Pixverse login with Playwright.

    Usage:
        async with PixverseAuthService() as auth:
            cookies = await auth.login_with_password(email, password)
    """

    LOGIN_URL = "https://app.pixverse.ai/login"
    API_LOGIN_URL = "https://app-api.pixverse.ai/creative_platform/login"

    def __init__(self) -> None:
        pass  # No persistent browser resources with sync API

    async def __aenter__(self) -> "PixverseAuthService":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        pass  # No cleanup needed with sync API

    async def cleanup(self) -> None:
        """No cleanup needed - sync Playwright manages its own resources."""
        pass

    def _login_sync(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, str]:
        """Synchronous Playwright login (runs in thread pool)."""
        try:
            from playwright.sync_api import sync_playwright  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Playwright is required for Pixverse re-auth. "
                "Install with `pip install playwright` and `playwright install`."
            ) from exc

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context()
            page = context.new_page()

            try:
                page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)
                page.wait_for_timeout(1000)

                # If already logged-in, clear session
                if "/login" not in page.url:
                    context.clear_cookies()
                    page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)
                    page.wait_for_timeout(500)

                # Try multiple selectors for email/username field
                email_selectors = [
                    'input[placeholder*="Email or Username"]',
                    'input[placeholder*="email"]',
                    '#Username',
                    'input[type="email"]',
                    'input[name="email"]',
                    'input[name="username"]',
                ]

                email_filled = False
                for selector in email_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=2000)
                        page.fill(selector, email)
                        email_filled = True
                        break
                    except Exception:
                        continue

                if not email_filled:
                    raise PixverseAuthError("Could not find email/username input field")

                # Try multiple selectors for password field
                password_selectors = [
                    'input[placeholder*="Password"]',
                    'input[placeholder*="password"]',
                    '#Password',
                    'input[type="password"]',
                    'input[name="password"]',
                ]

                password_filled = False
                for selector in password_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=2000)
                        page.fill(selector, password)
                        password_filled = True
                        break
                    except Exception:
                        continue

                if not password_filled:
                    raise PixverseAuthError("Could not find password input field")

                page.wait_for_timeout(300)

                # Try multiple selectors for login button
                login_button_selectors = [
                    "button:has-text('Login')",
                    "button.bg-create:has-text('Login')",
                    "button[type='submit']",
                    "button:has-text('Log in')",
                    "button:has-text('Sign in')",
                    "input[type='submit']",
                ]

                clicked = False
                for selector in login_button_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=2000)
                        page.click(selector)
                        clicked = True
                        break
                    except Exception:
                        continue

                if not clicked:
                    raise PixverseAuthError("Could not find Pixverse login button")

                page.wait_for_timeout(4000)
                if "/login" in page.url:
                    raise PixverseAuthError("Pixverse login failed (still on login page)")

                cookies = context.cookies()
                if not cookies:
                    raise PixverseAuthError("Pixverse login produced no cookies")

                cookie_map = {cookie["name"]: cookie["value"] for cookie in cookies}
                if "_ai_token" not in cookie_map:
                    self._save_debug(page)
                    raise PixverseAuthError("Pixverse login did not return _ai_token")

                return cookie_map
            except PixverseAuthError:
                self._save_debug(page)
                raise
            except Exception as exc:  # pragma: no cover - defensive
                self._save_debug(page)
                raise PixverseAuthError(str(exc)) from exc
            finally:
                context.close()
                browser.close()

    async def login_with_password(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, str]:
        """
        Login to Pixverse using direct API (fast, no browser needed).
        Falls back to Playwright if API login fails.

        Args:
            email: Pixverse account email/username
            password: Pixverse password
            headless: Whether to run browser headless (only used for Playwright fallback)
            timeout_ms: Timeout in milliseconds (only used for Playwright fallback)

        Returns:
            Session data with jwt_token and cookies

        Raises:
            PixverseAuthError: on login failure
        """
        try:
            # Try API login first (fast, no browser)
            return await self._login_api(email, password)
        except Exception as api_error:
            # Fallback to Playwright if API fails
            logger.warning(f"API login failed, falling back to Playwright: {api_error}")
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                _executor,
                lambda: self._login_sync(
                    email=email,
                    password=password,
                    headless=headless,
                    timeout_ms=timeout_ms
                )
            )

    async def _login_api(self, email: str, password: str) -> Dict[str, str]:
        """Login using direct Pixverse API (from pixverse-py)."""
        try:
            from pixverse.auth import EmailPasswordAuth
        except ImportError as exc:
            raise PixverseAuthError("pixverse-py not installed") from exc

        try:
            # Use pixverse-py's API login
            auth = EmailPasswordAuth()
            loop = asyncio.get_event_loop()
            # Run in thread pool since pixverse-py uses requests (sync)
            session = await loop.run_in_executor(
                _executor,
                lambda: auth.login(email, password)
            )

            # session = {'jwt_token': ..., 'account_id': ..., 'username': ..., 'cookies': {...}}
            # Return in format expected by extract_account_data
            return {
                'jwt_token': session['jwt_token'],
                'cookies': session.get('cookies', {}),
                'username': session.get('username'),
                'account_id': session.get('account_id'),
            }
        except Exception as e:
            raise PixverseAuthError(f"API login failed: {e}") from e

    def _save_debug(self, page) -> None:
        """Save a screenshot to help debug failures."""
        try:
            debug_dir = Path(settings.storage_base_path) / "reauth_debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            page.screenshot(path=str(debug_dir / f"pixverse_reauth_{ts}.png"))
        except Exception:
            pass
