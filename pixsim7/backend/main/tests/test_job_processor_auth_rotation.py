from pixsim7.backend.main.shared.errors import (
    ProviderAuthenticationError,
    ProviderError,
    ProviderQuotaExceededError,
)
from pixsim7.backend.main.workers.job_processor import _is_auth_rotation_error


def test_auth_rotation_detects_provider_authentication_error() -> None:
    error = ProviderAuthenticationError("pixverse", "session invalid")
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_detects_structured_provider_auth_code() -> None:
    error = ProviderError(
        "Pixverse account auth failed",
        error_code="provider_auth",
        retryable=False,
    )
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_detects_pixverse_session_markers_in_message() -> None:
    error = ProviderError("Pixverse API error 10005: user logged in elsewhere")
    assert _is_auth_rotation_error(error) is True


def test_auth_rotation_ignores_non_auth_provider_errors() -> None:
    error = ProviderQuotaExceededError("pixverse", 10)
    assert _is_auth_rotation_error(error) is False
