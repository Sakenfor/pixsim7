"""
Helper functions for structured provider logging.

Centralizes common fields for provider calls so logs are easy to
filter and visualize in the launcher DB log viewer.
"""
from __future__ import annotations

from typing import Any, Mapping, Optional

from pixsim_logging import get_logger
from pixsim_logging.spec import ensure_valid_stage


def _build_base_fields(
    provider_id: str,
    operation: str,
    *,
    stage: str = "provider:status",
    account_id: Optional[int] = None,
    email: Optional[str] = None,
    request_id: Optional[str] = None,
    error: Optional[str] = None,
    error_type: Optional[str] = None,
    extra: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "provider_id": provider_id,
        "operation_type": operation,
        "stage": ensure_valid_stage(stage),
    }

    if account_id is not None:
        fields["account_id"] = account_id
    if email is not None:
        fields["email"] = email
    if request_id is not None:
        fields["request_id"] = request_id
    if error is not None:
        fields["error"] = error
    if error_type is not None:
        fields["error_type"] = error_type

    if extra:
        # Extra metadata (e.g., retry counts, ad-task flags)
        for key, value in extra.items():
            # Avoid overwriting core fields
            if key not in fields:
                fields[key] = value

    return fields


def log_provider_timeout(
    *,
    provider_id: str,
    operation: str,
    stage: str = "provider:status",
    account_id: Optional[int] = None,
    email: Optional[str] = None,
    request_id: Optional[str] = None,
    error: Optional[str] = None,
    error_type: Optional[str] = None,
    extra: Optional[Mapping[str, Any]] = None,
) -> None:
    """
    Log a provider timeout in a normalized format.

    This is primarily used for upstream API timeouts (e.g. Pixverse
    dashboard/OpenAPI calls) so the launcher DB log viewer can quickly
    surface provider-level issues.
    """
    logger = get_logger()
    fields = _build_base_fields(
        provider_id=provider_id,
        operation=operation,
        stage=stage,
        account_id=account_id,
        email=email,
        request_id=request_id,
        error=error,
        error_type=error_type,
        extra=extra,
    )
    logger.warning("provider_timeout", **fields)


def log_provider_error(
    *,
    provider_id: str,
    operation: str,
    stage: str = "provider:status",
    account_id: Optional[int] = None,
    email: Optional[str] = None,
    request_id: Optional[str] = None,
    error: Optional[str] = None,
    error_type: Optional[str] = None,
    extra: Optional[Mapping[str, Any]] = None,
    severity: str = "error",
) -> None:
    """
    Log a provider error (non-timeout) in a normalized format.

    `severity` controls whether the event is logged as warning/error.
    """
    logger = get_logger()
    fields = _build_base_fields(
        provider_id=provider_id,
        operation=operation,
        stage=stage,
        account_id=account_id,
        email=email,
        request_id=request_id,
        error=error,
        error_type=error_type,
        extra=extra,
    )

    if severity == "warning":
        logger.warning("provider_error", **fields)
    else:
        logger.error("provider_error", **fields)


__all__ = [
    "log_provider_timeout",
    "log_provider_error",
]

