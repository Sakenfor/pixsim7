import pytest

from pixsim7.backend.main.services.provider.adapters.pixverse_errors import (
    handle_pixverse_error,
)
from pixsim7.backend.main.shared.errors import ProviderAuthenticationError


class _PixverseErrCodeException(Exception):
    def __init__(self, err_code: int, err_msg: str) -> None:
        super().__init__(err_msg)
        self.err_code = err_code
        self.err_msg = err_msg


def test_handle_pixverse_error_maps_session_errcode_to_auth_error() -> None:
    with pytest.raises(ProviderAuthenticationError) as exc:
        handle_pixverse_error(_PixverseErrCodeException(10005, "logged elsewhere"))

    assert "ErrCode 10005" in str(exc.value)


def test_handle_pixverse_error_maps_session_strings_to_auth_error() -> None:
    with pytest.raises(ProviderAuthenticationError):
        handle_pixverse_error(Exception("User is not login (10003)"))
