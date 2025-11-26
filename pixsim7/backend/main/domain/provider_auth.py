from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, TypedDict


class PixverseAuthMethod(str, Enum):
    """Authentication method for Pixverse accounts."""

    PASSWORD = "password"
    GOOGLE = "google"
    UNKNOWN = "unknown"

    @classmethod
    def from_metadata(cls, metadata: Optional[dict]) -> "PixverseAuthMethod":
        """Extract auth method from provider_metadata."""
        if not metadata:
            return cls.UNKNOWN
        value = metadata.get("auth_method")
        try:
            return cls(value)
        except Exception:
            return cls.UNKNOWN

    def allows_password_reauth(self) -> bool:
        """Return True if password-based reauth is valid for this method."""
        return self is PixverseAuthMethod.PASSWORD


class PixverseSessionData(TypedDict, total=False):
    """Structured session data for Pixverse provider operations."""

    jwt_token: Optional[str]
    cookies: dict[str, str]
    openapi_key: Optional[str]

    jwt_source: str
    auth_method: str


@dataclass
class SessionErrorOutcome:
    """Classification of a Pixverse error with respect to session state."""

    should_invalidate_cache: bool
    should_attempt_reauth: bool

    error_code: Optional[str]
    error_reason: str
    is_session_error: bool

    original_error: Optional[Exception] = None

    @staticmethod
    def no_error() -> "SessionErrorOutcome":
        return SessionErrorOutcome(
            should_invalidate_cache=False,
            should_attempt_reauth=False,
            error_code=None,
            error_reason="success",
            is_session_error=False,
            original_error=None,
        )

    @staticmethod
    def non_session_error(error: Exception) -> "SessionErrorOutcome":
        return SessionErrorOutcome(
            should_invalidate_cache=False,
            should_attempt_reauth=False,
            error_code=None,
            error_reason="non_session_error",
            is_session_error=False,
            original_error=error,
        )

