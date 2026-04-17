"""
Google OAuth Authentication Strategy

Handles Google OAuth login flow using Playwright browser automation.
"""

from typing import Dict, Any
from .base import BaseAuthStrategy
from ..exceptions import AuthenticationError


class GoogleOAuthStrategy(BaseAuthStrategy):
    """
    Google OAuth authentication using browser automation

    Requirements:
    - playwright installed: pip install pixverse-py[playwright]
    - Google email and password

    Process:
    1. Navigate to Pixverse login page
    2. Click "Login with Google" button
    3. Handle Google OAuth flow
    4. Extract session cookies
    """

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Login with Google OAuth

        Args:
            email: Google email
            password: Google password

        Returns:
            Session data with cookies

        Raises:
            AuthenticationError: If login fails or playwright not installed
        """
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise AuthenticationError(
                "playwright is required for Google OAuth login. "
                "Install with: pip install pixverse-py[playwright]"
            )

        try:
            with sync_playwright() as p:
                # Launch browser (headed for Google bot detection)
                browser = p.chromium.launch(
                    headless=False,  # Google may block headless
                    args=["--disable-blink-features=AutomationControlled"]
                )

                context = browser.new_context(
                    viewport={"width": 1280, "height": 720},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                )

                page = context.new_page()

                # Navigate to Pixverse login
                page.goto("https://app.pixverse.ai/login", timeout=30000)
                page.wait_for_load_state("networkidle")

                # Click "Login with Google" button
                try:
                    # Try multiple selectors
                    google_button_selectors = [
                        "button:has-text('Google')",
                        "button:has-text('Continue with Google')",
                        "[aria-label*='Google']",
                        ".google-login-button",
                    ]

                    for selector in google_button_selectors:
                        try:
                            page.click(selector, timeout=5000)
                            break
                        except:
                            continue
                    else:
                        raise AuthenticationError("Could not find Google login button")

                    page.wait_for_timeout(2000)

                except (TimeoutError, RuntimeError) as e:
                    browser.close()
                    raise AuthenticationError(f"Failed to click Google login button: {e}")

                # Handle Google OAuth popup/redirect
                try:
                    # Wait for Google login page
                    page.wait_for_url("**/accounts.google.com/**", timeout=10000)

                    # Fill email
                    page.fill('input[type="email"]', email)
                    page.click('button:has-text("Next"), #identifierNext')
                    page.wait_for_timeout(2000)

                    # Fill password
                    page.wait_for_selector('input[type="password"]', timeout=10000)
                    page.fill('input[type="password"]', password)
                    page.click('button:has-text("Next"), #passwordNext')

                    # Wait for redirect back to Pixverse
                    page.wait_for_url("**/app.pixverse.ai/**", timeout=30000)
                    page.wait_for_timeout(2000)

                except (TimeoutError, RuntimeError) as e:
                    browser.close()
                    raise AuthenticationError(f"Google OAuth flow failed: {e}")

                # Verify login success
                if "/login" in page.url or "/onboard" in page.url:
                    browser.close()
                    raise AuthenticationError("Login failed - still on login page")

                # Extract cookies
                cookies = context.cookies()
                browser.close()

                if not cookies:
                    raise AuthenticationError("No cookies retrieved after login")

                # Convert to dict format
                cookie_dict = {c["name"]: c["value"] for c in cookies}

                # Build session
                session = {
                    "cookies": cookie_dict,
                    "headers": {}
                }

                # Extract JWT token if present
                if "_ai_token" in cookie_dict:
                    session["headers"]["token"] = cookie_dict["_ai_token"]

                return session

        except AuthenticationError:
            raise
        except (ImportError, RuntimeError, TimeoutError, OSError, ValueError, KeyError) as e:
            # Browser automation errors, missing dependencies, or unexpected responses
            raise AuthenticationError(f"Google OAuth login failed: {e}")

    def refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Not applicable for Google OAuth - use SessionRefreshStrategy instead

        Args:
            session: Existing session

        Returns:
            Session (unchanged)
        """
        # For Google accounts, use SessionRefreshStrategy for refresh
        from .session_refresh import SessionRefreshStrategy
        strategy = SessionRefreshStrategy()
        return strategy.refresh(session)
