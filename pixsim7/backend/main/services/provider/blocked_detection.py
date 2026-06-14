"""Detect a provider 'account blocked / banned' error.

Pixverse signals a banned account with a generic ``ErrCode 10001`` whose
``ErrMsg`` is ``"account is blocked,exit"``. 10001 is NOT a dedicated ban code
in the SDK (it falls through ``_decode_err_code`` to the generic format), so we
deliberately require the message to mention "blocked" — otherwise some other
account-state condition that happens to share code 10001 could disable an
account by mistake. Confirmed empirically: a banned Pixverse account returns
exactly this code+message and is rejected at login.
"""
from __future__ import annotations

from pixsim7.backend.main.shared.errors import iter_exception_chain

_PIXVERSE_BLOCKED_ERR_CODE = 10001


def detect_account_blocked(error: BaseException) -> tuple[bool, int | None, str | None]:
    """Return ``(is_blocked, err_code, err_msg)`` for a provider exception.

    Prefers the structured ``err_code`` / ``err_msg`` attributes carried by the
    Pixverse ``APIError`` (anywhere in the cause/context chain), and falls back
    to string matching in case the error was re-wrapped without those
    attributes. Returns ``(False, None, None)`` when not a block.
    """
    for exc in iter_exception_chain(error):
        err_code = getattr(exc, "err_code", None)
        err_msg = getattr(exc, "err_msg", None)
        if (
            err_code == _PIXVERSE_BLOCKED_ERR_CODE
            and err_msg
            and "blocked" in str(err_msg).lower()
        ):
            return True, err_code, str(err_msg)

    # Fallback: the APIError may have been re-wrapped (e.g. into ProviderError)
    # losing the attributes — match on the rendered message instead.
    text = str(error).lower()
    if str(_PIXVERSE_BLOCKED_ERR_CODE) in text and "account is blocked" in text:
        return True, _PIXVERSE_BLOCKED_ERR_CODE, None

    return False, None, None
