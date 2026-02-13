"""
Pixverse error handling utilities.

Extracted from pixverse.py to reduce main adapter size.
"""
from typing import Any

from pixsim_logging import get_logger

from pixsim7.backend.main.services.provider.base import (
    ProviderError,
    AuthenticationError,
    QuotaExceededError,
    ContentFilteredError,
    JobNotFoundError,
    ConcurrentLimitError,
)

# Import SDK ContentModerationError (optional)
try:
    from pixverse import ContentModerationError as PixverseContentModerationError  # type: ignore
except ImportError:
    PixverseContentModerationError = None  # type: ignore


logger = get_logger()


def handle_pixverse_error(
    error: Exception,
    *,
    current_params: dict[str, Any] | None = None,
    current_operation_type: Any | None = None,
) -> None:
    """
    Handle Pixverse API errors, raising appropriate ProviderError subclasses.

    Args:
        error: Exception from pixverse-py
        current_params: Optional current generation params (for context in error messages)
        current_operation_type: Optional operation type (for context in error messages)

    Raises:
        Appropriate ProviderError subclass
    """
    raw_error = str(error)
    error_msg = raw_error.lower()

    # Special case: known SDK bug where APIError symbol is undefined.
    # The SDK raises a NameError with name "APIERROR"/"APIError".
    if isinstance(error, NameError):
        missing_name = getattr(error, "name", None)
        if missing_name and missing_name.lower() == "apierror":
            sdk_version = None
            try:  # Best-effort SDK version logging; don't fail if missing
                import pixverse as _pixverse  # type: ignore
                sdk_version = getattr(_pixverse, "__version__", None)
            except Exception:
                sdk_version = None

            logger.error(
                "pixverse_sdk_internal_error",
                msg="Pixverse SDK raised NameError for APIError symbol",
                error=raw_error,
                error_type=error.__class__.__name__,
                missing_name=missing_name,
                sdk_version=sdk_version or "unknown",
            )

            friendly = "Pixverse SDK internal error: APIError symbol is undefined in the SDK."
            if sdk_version:
                friendly += f" Detected pixverse-py version: {sdk_version}."
            friendly += " This is a provider-side issue; please update pixverse-py or contact support."

            raise ProviderError(friendly)

    # Handle SDK ContentModerationError directly (cleaner path)
    if PixverseContentModerationError and isinstance(error, PixverseContentModerationError):
        err_code = getattr(error, "err_code", None)
        err_msg = getattr(error, "err_msg", None)
        moderation_type = getattr(error, "moderation_type", "unknown")
        retryable = getattr(error, "retryable", False)

        logger.warning(
            "pixverse_content_moderation",
            err_code=err_code,
            moderation_type=moderation_type,
            retryable=retryable,
        )

        # Map SDK moderation_type to structured error_code
        _moderation_error_codes = {
            "prompt": "content_prompt_rejected",
            "text": "content_text_rejected",
            "output": "content_output_rejected",
            "image": "content_image_rejected",
        }
        gen_error_code = _moderation_error_codes.get(moderation_type, "content_filtered")

        friendly = f"Content filtered ({moderation_type}): {err_msg or raw_error}"
        raise ContentFilteredError(
            "pixverse", friendly, retryable=retryable, error_code=gen_error_code,
        )

    # Try to extract structured ErrCode/ErrMsg from SDK error (if available)
    err_code: int | None = None
    err_msg: str | None = None

    # Future‑proof: SDK may attach err_code/err_msg attributes
    if hasattr(error, "err_code"):
        try:
            err_code = int(getattr(error, "err_code"))  # type: ignore[arg-type]
        except Exception:
            err_code = None
    if hasattr(error, "err_msg"):
        try:
            err_msg = str(getattr(error, "err_msg"))
        except Exception:
            err_msg = None

    # Fallback: parse JSON body from underlying response if present
    if err_code is None and hasattr(error, "response"):
        resp = getattr(error, "response", None)
        try:
            if resp is not None and hasattr(resp, "json"):
                data = resp.json()
                if isinstance(data, dict) and "ErrCode" in data:
                    err_code = int(data.get("ErrCode", 0))
                    err_msg = str(data.get("ErrMsg", "")) or None
        except Exception:
            # If response.json() fails, just ignore and fall back to string‑based handling
            pass

    # If we have a structured error code, map it to a more precise ProviderError
    if err_code is not None and err_code != 0:
        # Expected operational errors get WARNING; unexpected errors get ERROR.
        # Caller already logs context.
        _log = logger.warning if err_code in _EXPECTED_ERR_CODES else logger.error
        _log(
            "pixverse_error",
            err_code=err_code,
            err_msg=err_msg or raw_error,
        )

        # Session/authentication errors (account-specific; caller may rotate account)
        if err_code in {10002, 10003, 10005}:
            friendly = (
                "Pixverse session is invalid for this account "
                f"(ErrCode {err_code}: {err_msg or raw_error})."
            )
            raise AuthenticationError("pixverse", friendly)

        # Content moderation / safety errors
        # 500063 = prompt/text rejected (not retryable - same prompt = same rejection)
        # 500054 = output content rejected (retryable - AI output varies)
        if err_code in {500054, 500063}:
            friendly = (
                "Pixverse rejected the content for safety or policy reasons "
                f"(ErrCode {err_code}: {err_msg or 'content moderation failed'})."
            )
            # Prompt rejections (500063) are not retryable
            retryable = err_code != 500063
            gen_error_code = (
                "content_prompt_rejected" if err_code == 500063
                else "content_output_rejected"
            )
            raise ContentFilteredError(
                "pixverse", friendly, retryable=retryable, error_code=gen_error_code,
            )

        # Insufficient balance / quota
        # 500090: generic insufficient balance
        # 500043: "All Credits have been used up" (treat as quota exhausted as well)
        if err_code in {500090, 500043}:
            friendly = (
                "Pixverse reports insufficient balance for this account. "
                "Please top up credits or pick a different account."
            )
            raise QuotaExceededError("pixverse", 0)

        # Concurrent generations limit
        if err_code in {500044}:
            raise ConcurrentLimitError("pixverse")

        # Prompt length / parameter validation
        if err_code in {400017, 400018, 400019}:
            friendly = (
                "Pixverse rejected the request due to invalid or too-long parameters. "
                "Try shortening or simplifying the prompt and checking extra options. "
                f"(ErrCode {err_code}: {err_msg or 'invalid parameter'})"
            )
            raise ProviderError(
                friendly, error_code="param_too_long", retryable=False,
            )

        # Permission / access
        if err_code in {500020, 500070, 500071}:
            friendly = (
                "This Pixverse account does not have permission or the required template "
                f"for the requested operation (ErrCode {err_code}: {err_msg or 'permission error'})."
            )
            raise ProviderError(
                friendly, error_code="provider_auth", retryable=False,
            )

        # High load / temporary issues
        if err_code in {500069}:
            friendly = (
                "Pixverse is currently under high load and cannot process this request. "
                "Please try again in a few moments."
            )
            raise ProviderError(
                friendly, error_code="provider_unavailable", retryable=True,
            )

        # Generic mapping for any other known ErrCode
        friendly = f"Pixverse API error {err_code}: {err_msg or raw_error}"
        raise ProviderError(friendly, error_code="provider_generic")

    # Authentication errors (fallback when no structured ErrCode was found)
    if (
        "auth" in error_msg
        or "token" in error_msg
        or "unauthorized" in error_msg
        or "logged in elsewhere" in error_msg
        or "user is not login" in error_msg
        or "session expired" in error_msg
    ):
        raise AuthenticationError("pixverse", raw_error)

    # Quota errors
    if "quota" in error_msg or "credits" in error_msg or "insufficient" in error_msg:
        raise QuotaExceededError("pixverse", 0)

    # Content filtered
    if "filtered" in error_msg or "policy" in error_msg or "inappropriate" in error_msg:
        raise ContentFilteredError("pixverse", raw_error)

    # Job not found
    if "not found" in error_msg or "404" in error_msg:
        # Try to extract video/job ID from stored context
        job_id = "unknown"
        if current_params:
            # For extend operations, try to get original_video_id or video_url
            from pixsim7.backend.main.domain import OperationType
            if current_operation_type == OperationType.VIDEO_EXTEND:
                job_id = current_params.get("original_video_id") or \
                         current_params.get("video_url") or \
                         "unknown"
                logger.warning(
                    "extend_video_404",
                    extra={
                        "video_url": current_params.get("video_url"),
                        "original_video_id": current_params.get("original_video_id"),
                        "error": raw_error
                    }
                )
        raise JobNotFoundError("pixverse", job_id)

    # Generic provider error
    raise ProviderError(f"Pixverse API error: {raw_error}")


# Error codes that represent expected operational conditions (quota, content
# moderation, concurrency, param validation, high load, permissions).
# These should be logged at WARNING, not ERROR.
_EXPECTED_ERR_CODES = {
    500043, 500090,          # quota / insufficient balance
    500054, 500063,          # content moderation (output / prompt)
    500044,                  # concurrent limit
    400017, 400018, 400019,  # param validation (prompt too long, etc.)
    500069,                  # high load / temporary unavailable
    500020, 500070, 500071,  # permission / access
}


def is_expected_pixverse_error(error: Exception) -> bool:
    """Return True if the error maps to an expected operational condition.

    Used by callers to decide log severity before ``handle_pixverse_error``
    re-raises as a typed ProviderError.
    """
    err_code = getattr(error, "err_code", None)
    if err_code is not None:
        try:
            return int(err_code) in _EXPECTED_ERR_CODES
        except (ValueError, TypeError):
            pass

    # Also check for SDK ContentModerationError
    if PixverseContentModerationError and isinstance(error, PixverseContentModerationError):
        return True

    # Fallback: check common string patterns for quota/content errors
    msg = str(error).lower()
    return any(kw in msg for kw in ("credits", "quota", "insufficient", "filtered", "policy"))
