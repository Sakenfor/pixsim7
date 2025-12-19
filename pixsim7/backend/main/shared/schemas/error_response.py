"""
Standardized API Error Response Schema

Provides a consistent error response format across all API endpoints.
This schema is used by exception handlers and documented in OpenAPI.
"""
from pydantic import BaseModel, Field
from typing import Any


class ErrorResponse(BaseModel):
    """
    Standard error response format for all API errors.

    This schema ensures consistent error handling across:
    - HTTP exceptions (401, 403, 404, 409, etc.)
    - Validation errors (422)
    - Application exceptions (PixSimError hierarchy)
    - Unhandled server errors (500)

    Example responses:

        # Validation error (422)
        {
            "code": "validation_error",
            "message": "Invalid request data",
            "detail": "Field validation failed",
            "fields": [{"loc": ["body", "name"], "msg": "required", "type": "missing"}]
        }

        # Not found (404)
        {
            "code": "not_found",
            "message": "Resource not found",
            "detail": "User with id 123 not found"
        }

        # Server error (500)
        {
            "code": "internal_error",
            "message": "Internal server error",
            "detail": null
        }
    """

    code: str = Field(
        ...,
        description="Machine-readable error code (e.g., 'validation_error', 'not_found', 'unauthorized')",
        examples=["validation_error", "not_found", "unauthorized", "forbidden", "conflict", "internal_error"]
    )

    message: str = Field(
        ...,
        description="Human-readable error summary",
        examples=["Invalid request data", "Resource not found", "Authentication required"]
    )

    detail: str | None = Field(
        default=None,
        description="Additional details about the error (may be null for security-sensitive errors)",
        examples=["User with id 123 not found", "Token has expired"]
    )

    fields: list[dict[str, Any]] | None = Field(
        default=None,
        description="Field-level validation errors (only present for validation errors)",
        examples=[[{"loc": ["body", "email"], "msg": "invalid email format", "type": "value_error"}]]
    )

    request_id: str | None = Field(
        default=None,
        description="Request ID for debugging and support (from X-Request-ID header)",
        examples=["req_abc123xyz"]
    )


# Common error codes used across the API
class ErrorCodes:
    """Machine-readable error codes for programmatic handling."""

    # Authentication & Authorization
    UNAUTHORIZED = "unauthorized"
    FORBIDDEN = "forbidden"
    TOKEN_EXPIRED = "token_expired"
    TOKEN_INVALID = "token_invalid"

    # Resource errors
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    ALREADY_EXISTS = "already_exists"

    # Validation
    VALIDATION_ERROR = "validation_error"
    INVALID_REQUEST = "invalid_request"

    # Server errors
    INTERNAL_ERROR = "internal_error"
    SERVICE_UNAVAILABLE = "service_unavailable"

    # Application-specific (from PixSimError hierarchy)
    RESOURCE_NOT_FOUND = "resource_not_found"
    PROVIDER_ERROR = "provider_error"
    PROVIDER_QUOTA_EXCEEDED = "provider_quota_exceeded"
    PROVIDER_RATE_LIMIT = "provider_rate_limit"
    PROVIDER_CONTENT_FILTERED = "provider_content_filtered"
    ACCOUNT_EXHAUSTED = "account_exhausted"
    JOB_CANCELLED = "job_cancelled"
    QUOTA_EXCEEDED = "quota_exceeded"
