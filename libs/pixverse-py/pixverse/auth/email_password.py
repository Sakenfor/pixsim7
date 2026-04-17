"""
Email/Password authentication strategy
"""

import requests
from typing import Dict, Any
from .base import BaseAuthStrategy
from ..exceptions import AuthenticationError


class EmailPasswordAuth(BaseAuthStrategy):
    """
    Authenticate using email and password
    """

    BASE_URL = "https://app-api.pixverse.ai"

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Login with email and password via Pixverse Web API.

        Args:
            email: Account email or username
            password: Account password

        Returns:
            Session data with JWT token and account info

        Raises:
            AuthenticationError: If login fails
        """
        try:
            response = requests.post(
                f"{self.BASE_URL}/creative_platform/login",
                json={
                    "username": email,  # API expects 'username' field, not 'email'
                    "password": password
                },
                timeout=30
            )

            if response.status_code != 200:
                # Try to get error details from response body
                error_detail = ""
                try:
                    error_data = response.json()
                    error_msg = error_data.get("ErrMsg", "")
                    error_code = error_data.get("ErrCode", "")
                    if error_msg or error_code:
                        error_detail = f" (ErrCode={error_code}, ErrMsg={error_msg})"
                except (ValueError, KeyError):
                    pass
                raise AuthenticationError(f"Login failed with status {response.status_code}{error_detail}")

            data = response.json()

            # Check for API error
            if data.get("ErrCode") != 0:
                raise AuthenticationError(f"Login failed: {data.get('ErrMsg', 'Unknown error')}")

            # Extract result
            result = data.get("Resp", {}).get("Result", {})
            if not result or "Token" not in result:
                raise AuthenticationError("Login response missing token")

            # Build session data
            session = {
                "jwt_token": result["Token"],
                "account_id": result.get("AccountId"),
                "username": result.get("Username"),
                "cookies": dict(response.cookies),
            }

            return session

        except requests.RequestException as e:
            raise AuthenticationError(f"Login request failed: {e}")

    def login_with_browser_fallback(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, Any]:
        """
        Login with email/password, using Web API first and falling back to Playwright.

        Returns a normalized session dict:
            {
                "jwt_token": str,
                "cookies": dict,
                "account_id": ...,
                "username": ...,
            }

        Raises:
            AuthenticationError: If both API and browser login fail.
        """
        try:
            return self.login(email, password)
        except AuthenticationError as api_error:
            # If backend reports that this account must use OAuth, or that the
            # user does not exist, do not attempt a password-based browser
            # login. Surface the original error so callers can treat the
            # account as OAuth-only or misconfigured.
            msg = str(api_error)
            lower = msg.lower()
            if (
                "please sign in via oauth" in lower
                or "oauth" in lower
                or "user does not exist" in lower
            ):
                raise api_error

            # Fallback to browser-based login using Playwright
            try:
                from playwright.sync_api import sync_playwright  # type: ignore
            except ImportError as exc:
                raise AuthenticationError(
                    "playwright is required for browser-based login fallback. "
                    "Install with: pip install pixverse-py[playwright]"
                ) from exc

            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=headless)
                    context = browser.new_context()
                    page = context.new_page()

                    try:
                        page.goto("https://app.pixverse.ai/login", wait_until="domcontentloaded", timeout=timeout_ms)
                        page.wait_for_timeout(1000)

                        # If already logged-in, clear session and reload login
                        if "/login" not in page.url:
                            context.clear_cookies()
                            page.goto("https://app.pixverse.ai/login", wait_until="domcontentloaded", timeout=timeout_ms)
                            page.wait_for_timeout(500)

                        # Email/username field
                        email_selectors = [
                            'input[placeholder*="Email or Username"]',
                            'input[placeholder*="email"]',
                            '#Username',
                            'input[type="email"]',
                            'input[name="email"]',
                            'input[name="username"]',
                        ]
                        for selector in email_selectors:
                            try:
                                page.wait_for_selector(selector, timeout=2000)
                                page.fill(selector, email)
                                break
                            except Exception:
                                continue
                        else:
                            raise AuthenticationError("Could not find email/username input field")

                        # Password field
                        password_selectors = [
                            'input[placeholder*="Password"]',
                            'input[placeholder*="password"]',
                            '#Password',
                            'input[type="password"]',
                            'input[name="password"]',
                        ]
                        for selector in password_selectors:
                            try:
                                page.wait_for_selector(selector, timeout=2000)
                                page.fill(selector, password)
                                break
                            except Exception:
                                continue
                        else:
                            raise AuthenticationError("Could not find password input field")

                        page.wait_for_timeout(300)

                        # Login button
                        login_button_selectors = [
                            "button:has-text('Login')",
                            "button.bg-create:has-text('Login')",
                            "button[type='submit']",
                            "button:has-text('Log in')",
                            "button:has-text('Sign in')",
                            "input[type='submit']",
                        ]
                        for selector in login_button_selectors:
                            try:
                                page.wait_for_selector(selector, timeout=2000)
                                page.click(selector)
                                break
                            except Exception:
                                continue
                        else:
                            raise AuthenticationError("Could not find Pixverse login button")

                        page.wait_for_timeout(4000)
                        if "/login" in page.url:
                            raise AuthenticationError("Pixverse login failed (still on login page)")

                        cookies = context.cookies()
                        if not cookies:
                            raise AuthenticationError("Pixverse login produced no cookies")

                        cookie_map = {cookie["name"]: cookie["value"] for cookie in cookies}
                        token = cookie_map.get("_ai_token")
                        if not token:
                            raise AuthenticationError("Pixverse login did not return _ai_token")

                        return {
                            "jwt_token": token,
                            "cookies": cookie_map,
                            "account_id": None,
                            "username": None,
                        }
                    finally:
                        context.close()
                        browser.close()
            except AuthenticationError:
                raise
            except Exception as exc:
                raise AuthenticationError(f"Browser login failed: {exc}") from exc

    def refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Refresh session

        Args:
            session: Existing session data

        Returns:
            Refreshed session data

        Raises:
            AuthenticationError: If refresh fails
        """
        try:
            response = requests.post(
                f"{self.BASE_URL}/auth/refresh",
                cookies=session.get("cookies", {}),
                headers=session.get("headers", {}),
                timeout=30
            )

            if response.status_code != 200:
                raise AuthenticationError(f"Session refresh failed: {response.status_code}")

            # Update session
            session["cookies"].update(dict(response.cookies))

            data = response.json()
            if "token" in data:
                session["headers"]["Authorization"] = f"Bearer {data['token']}"

            return session

        except requests.RequestException as e:
            raise AuthenticationError(f"Refresh request failed: {e}")
