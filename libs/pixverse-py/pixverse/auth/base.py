"""
Base authentication classes
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from ..exceptions import AuthenticationError


class BaseAuthStrategy(ABC):
    """Base class for authentication strategies"""

    @abstractmethod
    def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticate and return session data

        Args:
            email: Account email
            password: Account password

        Returns:
            Session data (cookies, tokens, etc.)

        Raises:
            AuthenticationError: If authentication fails
        """
        pass

    @abstractmethod
    def refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Refresh existing session

        Args:
            session: Existing session data

        Returns:
            Refreshed session data

        Raises:
            AuthenticationError: If refresh fails
        """
        pass


class PixverseAuth:
    """
    Main authentication handler
    Supports multiple authentication strategies:
    - Email/Password: Standard login
    - Google OAuth: Browser-based OAuth flow (requires playwright)
    - Session Refresh: Refresh using existing cookies/JWT (fast-path via API)
    """

    def __init__(self, strategy: Optional[BaseAuthStrategy] = None):
        """
        Initialize auth handler

        Args:
            strategy: Authentication strategy to use (defaults to email/password)
        """
        from .email_password import EmailPasswordAuth

        self.strategy = strategy or EmailPasswordAuth()

    def login(self, email: str, password: str, method: str = "email") -> Dict[str, Any]:
        """
        Login with credentials

        Args:
            email: Account email
            password: Account password
            method: Authentication method ("email" or "google")

        Returns:
            Session data with cookies and JWT token

        Raises:
            AuthenticationError: If login fails
        """
        if method == "google":
            from .google_oauth import GoogleOAuthStrategy
            self.strategy = GoogleOAuthStrategy()
        else:
            from .email_password import EmailPasswordAuth
            self.strategy = EmailPasswordAuth()

        return self.strategy.login(email, password)

    def login_with_browser_fallback(
        self,
        email: str,
        password: str,
        *,
        headless: bool = True,
        timeout_ms: int = 60_000,
    ) -> Dict[str, Any]:
        """
        Login using Web API first and fall back to Playwright if needed.

        Returns:
            Session data with cookies and JWT token.

        Raises:
            AuthenticationError: If both API and browser login fail.
        """
        from .email_password import EmailPasswordAuth

        self.strategy = EmailPasswordAuth()
        return self.strategy.login_with_browser_fallback(
            email,
            password,
            headless=headless,
            timeout_ms=timeout_ms,
        )

    def login_with_google_id_token(self, id_token: str) -> Dict[str, Any]:
        """
        Login using a Google ID token obtained from an OAuth flow.

        Args:
            id_token: Google ID token.

        Returns:
            Session data with cookies and JWT token.

        Raises:
            AuthenticationError: If the Pixverse API call fails.
        """
        from .google_id_token import login_with_google_id_token

        return login_with_google_id_token(id_token)

    def refresh(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Refresh session using existing cookies/JWT

        Features:
        - Fast-path: Validates via API (no browser)
        - Fallback: Browser refresh if needed (requires playwright)

        Args:
            session: Existing session data

        Returns:
            Refreshed session data

        Raises:
            AuthenticationError: If refresh fails
        """
        from .session_refresh import SessionRefreshStrategy
        refresh_strategy = SessionRefreshStrategy()
        return refresh_strategy.refresh(session)

    def logout(self, session: Dict[str, Any]):
        """Logout and invalidate session"""
        # TODO: Implement logout
        pass
