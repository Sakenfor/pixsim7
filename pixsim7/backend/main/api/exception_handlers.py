"""
Global Exception Handlers for FastAPI

Provides consistent error responses across all API endpoints.
All errors are converted to the standardized ErrorResponse format.
"""
import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from pixsim7.backend.main.shared.schemas.error_response import ErrorResponse, ErrorCodes
from pixsim7.backend.main.shared.errors import (
    PixSimError,
    ResourceNotFoundError,
    ResourceAlreadyExistsError,
    ValidationError as PixSimValidationError,
    InvalidOperationError,
    AuthenticationError,
    ProviderError,
    ProviderQuotaExceededError,
    ProviderRateLimitError,
    ProviderContentFilteredError,
    ProviderConcurrentLimitError,
    AccountError,
    NoAccountAvailableError,
    AccountExhaustedError,
    JobError,
    JobCancelledError,
    QuotaError,
    StorageError,
)

logger = structlog.get_logger(__name__)


def get_request_id(request: Request) -> str | None:
    """Extract request ID from request state or headers."""
    # Try request state first (set by RequestIdMiddleware)
    if hasattr(request.state, "request_id"):
        return request.state.request_id
    # Fall back to header
    return request.headers.get("X-Request-ID")


def create_error_response(
    status_code: int,
    code: str,
    message: str,
    detail: str | None = None,
    fields: list | None = None,
    request_id: str | None = None,
) -> JSONResponse:
    """Create a standardized JSON error response."""
    error = ErrorResponse(
        code=code,
        message=message,
        detail=detail,
        fields=fields,
        request_id=request_id,
    )
    return JSONResponse(
        status_code=status_code,
        content=error.model_dump(exclude_none=True),
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """
    Handle HTTP exceptions (401, 403, 404, etc.).

    Converts FastAPI/Starlette HTTP exceptions to ErrorResponse format.
    """
    request_id = get_request_id(request)

    # Map status codes to error codes
    code_map = {
        status.HTTP_400_BAD_REQUEST: ErrorCodes.INVALID_REQUEST,
        status.HTTP_401_UNAUTHORIZED: ErrorCodes.UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN: ErrorCodes.FORBIDDEN,
        status.HTTP_404_NOT_FOUND: ErrorCodes.NOT_FOUND,
        status.HTTP_409_CONFLICT: ErrorCodes.CONFLICT,
        status.HTTP_422_UNPROCESSABLE_ENTITY: ErrorCodes.VALIDATION_ERROR,
        status.HTTP_500_INTERNAL_SERVER_ERROR: ErrorCodes.INTERNAL_ERROR,
        status.HTTP_503_SERVICE_UNAVAILABLE: ErrorCodes.SERVICE_UNAVAILABLE,
    }

    error_code = code_map.get(exc.status_code, f"http_{exc.status_code}")

    # Use detail as message if it's a string, otherwise extract
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)

    # Log for non-4xx errors
    if exc.status_code >= 500:
        logger.error(
            "http_exception",
            status_code=exc.status_code,
            detail=detail,
            request_id=request_id,
            path=request.url.path,
        )

    return create_error_response(
        status_code=exc.status_code,
        code=error_code,
        message=detail,
        request_id=request_id,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Handle request validation errors (422).

    Provides detailed field-level validation error information.
    """
    request_id = get_request_id(request)

    # Format field errors
    fields = []
    for error in exc.errors():
        fields.append({
            "loc": list(error.get("loc", [])),
            "msg": error.get("msg", "Validation error"),
            "type": error.get("type", "value_error"),
        })

    logger.warning(
        "validation_error",
        errors=fields,
        request_id=request_id,
        path=request.url.path,
    )

    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code=ErrorCodes.VALIDATION_ERROR,
        message="Invalid request data",
        detail="One or more fields failed validation",
        fields=fields,
        request_id=request_id,
    )


async def pixsim_exception_handler(
    request: Request, exc: PixSimError
) -> JSONResponse:
    """
    Handle PixSim application exceptions.

    Maps custom exception types to appropriate HTTP status codes.
    """
    request_id = get_request_id(request)

    # Map exception types to status codes and error codes
    if isinstance(exc, ResourceNotFoundError):
        status_code = status.HTTP_404_NOT_FOUND
        code = ErrorCodes.RESOURCE_NOT_FOUND
    elif isinstance(exc, ResourceAlreadyExistsError):
        status_code = status.HTTP_409_CONFLICT
        code = ErrorCodes.ALREADY_EXISTS
    elif isinstance(exc, (PixSimValidationError, InvalidOperationError)):
        status_code = status.HTTP_400_BAD_REQUEST
        code = ErrorCodes.VALIDATION_ERROR
    elif isinstance(exc, AuthenticationError):
        status_code = status.HTTP_401_UNAUTHORIZED
        code = ErrorCodes.UNAUTHORIZED
    elif isinstance(exc, ProviderQuotaExceededError):
        status_code = status.HTTP_402_PAYMENT_REQUIRED
        code = ErrorCodes.PROVIDER_QUOTA_EXCEEDED
    elif isinstance(exc, ProviderRateLimitError):
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
        code = ErrorCodes.PROVIDER_RATE_LIMIT
    elif isinstance(exc, ProviderContentFilteredError):
        status_code = status.HTTP_400_BAD_REQUEST
        code = ErrorCodes.PROVIDER_CONTENT_FILTERED
    elif isinstance(exc, ProviderConcurrentLimitError):
        status_code = status.HTTP_429_TOO_MANY_REQUESTS
        code = ErrorCodes.PROVIDER_RATE_LIMIT
    elif isinstance(exc, ProviderError):
        status_code = status.HTTP_502_BAD_GATEWAY
        code = ErrorCodes.PROVIDER_ERROR
    elif isinstance(exc, (NoAccountAvailableError, AccountExhaustedError)):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        code = ErrorCodes.ACCOUNT_EXHAUSTED
    elif isinstance(exc, AccountError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        code = ErrorCodes.SERVICE_UNAVAILABLE
    elif isinstance(exc, JobCancelledError):
        status_code = status.HTTP_409_CONFLICT
        code = ErrorCodes.JOB_CANCELLED
    elif isinstance(exc, JobError):
        status_code = status.HTTP_400_BAD_REQUEST
        code = exc.code.lower() if exc.code else ErrorCodes.INVALID_REQUEST
    elif isinstance(exc, QuotaError):
        status_code = status.HTTP_402_PAYMENT_REQUIRED
        code = ErrorCodes.QUOTA_EXCEEDED
    elif isinstance(exc, StorageError):
        status_code = status.HTTP_507_INSUFFICIENT_STORAGE
        code = ErrorCodes.SERVICE_UNAVAILABLE
    else:
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        code = exc.code.lower() if exc.code else ErrorCodes.INTERNAL_ERROR

    # Log application errors
    logger.warning(
        "pixsim_exception",
        exception_type=exc.__class__.__name__,
        code=code,
        message=exc.message,
        request_id=request_id,
        path=request.url.path,
    )

    return create_error_response(
        status_code=status_code,
        code=code,
        message=exc.message,
        request_id=request_id,
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """
    Handle unhandled exceptions (500).

    Logs the full exception but returns a generic error to avoid leaking details.
    """
    request_id = get_request_id(request)

    # Log full exception for debugging
    logger.exception(
        "unhandled_exception",
        exception_type=exc.__class__.__name__,
        request_id=request_id,
        path=request.url.path,
        method=request.method,
    )

    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code=ErrorCodes.INTERNAL_ERROR,
        message="Internal server error",
        # Don't expose exception details in production
        detail=None,
        request_id=request_id,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """
    Register all exception handlers with the FastAPI app.

    Call this during app initialization to enable consistent error handling.
    """
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(PixSimError, pixsim_exception_handler)
    # Catch-all for unhandled exceptions
    app.add_exception_handler(Exception, unhandled_exception_handler)
