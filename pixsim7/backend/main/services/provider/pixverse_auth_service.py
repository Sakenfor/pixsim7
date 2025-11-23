"""
Pixverse automated authentication using Playwright.

Allows refreshing Pixverse JWT/cookies server-side (useful for headless re-auth flows).
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from pixsim7.backend.main.shared.config import settings


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

    def __init__(self) -> None:
        self._playwright = None
        self._browser = None

    async def __aenter__(self) -> "PixverseAuthService":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.cleanup()

    async def cleanup(self) -> None:
        """Close browser resources."""
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

    async def _ensure_browser(self, *, headless: bool) -> Any:
        try:
            from playwright.async_api import async_playwright  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Playwright is required for Pixverse re-auth. "
                "Install with `pip install playwright` and `playwright install`."
            ) from exc

        if not self._playwright:
            self._playwright = await async_playwright().start()
        if not self._browser:
            self._browser = await self._playwright.chromium.launch(headless=headless)
        return self._browser

    async def login_with_password(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, str]:
        """
        Automate Pixverse email/password login and return cookies.

        Args:
            email: Pixverse account email
            password: Pixverse password
            headless: Whether to run browser headless
            timeout_ms: Playwright timeout in milliseconds

        Raises:
            PixverseAuthError: on login failure
        """
        browser = await self._ensure_browser(headless=headless)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_timeout(1000)

            # If already logged-in, clear session
            if "/login" not in page.url:
                await context.clear_cookies()
                await page.goto(self.LOGIN_URL, wait_until="domcontentloaded", timeout=timeout_ms)
                await page.wait_for_timeout(500)

            await page.fill("#Username", email)
            await page.fill("#Password", password)
            await page.wait_for_timeout(300)

            selectors = [
                "button:has-text('Login')",
                "button.bg-create:has-text('Login')",
            ]

            clicked = False
            for selector in selectors:
                try:
                    await page.wait_for_selector(selector, timeout=2000)
                    await page.click(selector)
                    clicked = True
                    break
                except Exception:
                    continue

            if not clicked:
                raise PixverseAuthError("Could not find Pixverse login button")

            await page.wait_for_timeout(4000)
            if "/login" in page.url:
                raise PixverseAuthError("Pixverse login failed (still on login page)")

            cookies = await context.cookies()
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
            await context.close()

    def _save_debug(self, page) -> None:
        """Save a screenshot to help debug failures."""
        try:
            debug_dir = Path(settings.storage_base_path) / "reauth_debug"
            debug_dir.mkdir(parents=True, exist_ok=True)
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            page.screenshot(path=str(debug_dir / f"pixverse_reauth_{ts}.png"))
        except Exception:
            pass
