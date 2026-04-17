"""
Session Refresh Strategy with JWT

Refreshes session using existing cookies/JWT token (no password required).
Supports both fast-path (API validation) and full browser refresh.
"""

import requests
from typing import Dict, Any, Optional
from .base import BaseAuthStrategy
from ..exceptions import AuthenticationError


class SessionRefreshStrategy(BaseAuthStrategy):
    """
    Refresh session using existing JWT token and cookies

    Features:
    - Fast-path: Validate session via API call (no browser)
    - Fallback: Browser refresh if fast-path fails
    - JWT token extraction and update
    """

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Not supported - use refresh() instead"""
        raise NotImplementedError("SessionRefreshStrategy does not support login with credentials")

    def refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Refresh session using existing cookies/JWT

        Args:
            session: Existing session with cookies and/or JWT token

        Returns:
            Refreshed session data

        Raises:
            AuthenticationError: If refresh fails
        """
        # Extract JWT token from session
        jwt_token = self._extract_jwt_token(session)

        if not jwt_token:
            raise AuthenticationError("No JWT token found in session")

        # Fast-path: Validate session via API
        try:
            if self._validate_session_api(session, jwt_token):
                return session  # Session still valid
        except (requests.RequestException, ValueError, KeyError) as e:
            # Fast-path failed, will try browser refresh
            import logging
            logger = logging.getLogger(__name__)
            logger.debug("Fast-path session validation failed: %s, falling back to browser refresh", e)

        # Fallback: Browser refresh (requires playwright)
        return self._browser_refresh(session)

    def _extract_jwt_token(self, session: Dict[str, Any]) -> Optional[str]:
        """
        Extract JWT token from session

        Checks:
        1. session['headers']['Authorization']
        2. session['headers']['token']
        3. session['cookies']['_ai_token']

        Returns:
            JWT token or None
        """
        # Check headers
        headers = session.get("headers", {})
        if "Authorization" in headers:
            auth = headers["Authorization"]
            if auth.startswith("Bearer "):
                return auth[7:]  # Remove "Bearer " prefix
            return auth

        if "token" in headers:
            return headers["token"]

        # Check cookies
        cookies = session.get("cookies", {})
        if "_ai_token" in cookies:
            return cookies["_ai_token"]

        return None

    def _validate_session_api(
        self,
        session: Dict[str, Any],
        jwt_token: str,
        base_url: str = "https://app-api.pixverse.ai"
    ) -> bool:
        """
        Fast-path: Validate session via API call

        Args:
            session: Session data
            jwt_token: JWT token
            base_url: API base URL

        Returns:
            True if session is valid
        """
        # Test endpoints
        test_urls = [
            f"{base_url}/creative_platform/config/ad_credits",
            f"{base_url}/creative_platform/user/credits",
        ]

        # Build session
        s = requests.Session()

        # Add cookies
        cookies = session.get("cookies", {})
        for name, value in cookies.items():
            s.cookies.set(name, value)

        # Add JWT token to headers
        s.headers.update({
            "token": jwt_token,
            "Content-Type": "application/json",
            "Origin": "https://app.pixverse.ai",
            "Referer": "https://app.pixverse.ai/",
        })

        # Try endpoints (short timeout)
        for url in test_urls:
            try:
                resp = s.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    # Check for success response
                    if isinstance(data, dict) and data.get("ErrCode") == 0:
                        # Session is valid!
                        return True
            except (requests.RequestException, ValueError, KeyError):
                # Request failed or invalid JSON, try next URL
                continue

        return False

    def _browser_refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fallback: Refresh session using browser automation

        Args:
            session: Session data

        Returns:
            Refreshed session

        Raises:
            AuthenticationError: If playwright not installed or refresh fails
        """
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise AuthenticationError(
                "playwright is required for browser-based session refresh. "
                "Install with: pip install pixverse-py[playwright]"
            )

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)

                # Convert cookies to playwright format
                cookies = self._convert_cookies_for_playwright(session.get("cookies", {}))

                context = browser.new_context()
                if cookies:
                    context.add_cookies(cookies)

                page = context.new_page()

                # Navigate to Pixverse to refresh session
                page.goto("https://app.pixverse.ai/asset/video", timeout=30000, wait_until="load")

                # Wait for page to load
                page.wait_for_timeout(2000)

                # Check if redirected to login (session expired)
                if "/login" in page.url or "/onboard" in page.url:
                    browser.close()
                    raise AuthenticationError("Session expired - redirected to login page")

                # Get fresh cookies
                fresh_cookies = context.cookies()

                browser.close()

                # Convert back to dict format
                cookie_dict = {c["name"]: c["value"] for c in fresh_cookies}

                # Update session
                session["cookies"] = cookie_dict

                # Extract JWT token from cookies
                if "_ai_token" in cookie_dict:
                    session.setdefault("headers", {})["token"] = cookie_dict["_ai_token"]

                return session

        except AuthenticationError:
            raise
        except (ImportError, RuntimeError, TimeoutError, OSError) as e:
            # Browser automation errors (playwright import, browser launch, timeouts, etc.)
            raise AuthenticationError(f"Browser refresh failed: {e}")

    def _convert_cookies_for_playwright(self, cookies: Dict[str, str]) -> list:
        """
        Convert cookie dict to playwright format

        Args:
            cookies: Dict of cookie name -> value

        Returns:
            List of playwright cookie dicts
        """
        return [
            {
                "name": name,
                "value": value,
                "domain": ".pixverse.ai",
                "path": "/",
            }
            for name, value in cookies.items()
        ]
