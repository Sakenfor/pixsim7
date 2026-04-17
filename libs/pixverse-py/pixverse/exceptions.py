"""
Pixverse SDK Exceptions
Custom exception classes for error handling
"""


class PixverseError(Exception):
    """Base exception for all Pixverse errors"""
    pass


class AuthenticationError(PixverseError):
    """Raised when authentication fails"""
    pass


class APIError(PixverseError):
    """Raised when API returns an error.

    Attributes:
        status_code: Optional HTTP status code for transport-level errors.
        response: Optional raw response object (e.g., requests.Response).
        err_code: Optional Pixverse ErrCode from JSON payload.
        err_msg: Optional Pixverse ErrMsg from JSON payload.
    """

    def __init__(
        self,
        message,
        status_code=None,
        response=None,
        err_code=None,
        err_msg=None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.response = response
        self.err_code = err_code
        self.err_msg = err_msg


class RateLimitError(APIError):
    """Raised when API rate limit is exceeded"""

    def __init__(self, message="Rate limit exceeded", retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


class GenerationError(APIError):
    """Raised when video generation fails"""
    pass


class VideoNotFoundError(APIError):
    """Raised when a video cannot be found"""
    pass


class InvalidParameterError(APIError):
    """Raised when invalid parameters are provided"""
    pass


class InsufficientCreditsError(APIError):
    """Raised when the user has insufficient balance/credits"""
    pass


class ContentModerationError(APIError):
    """Raised when content is rejected by moderation (prompt, image, or output).

    Attributes:
        err_code: The specific Pixverse error code (e.g., 500054, 500063).
        moderation_type: Type of content that failed - 'prompt', 'image', or 'output'.
        retryable: Whether the error might succeed on retry (output rejections
                   are retryable since AI output varies; prompt/image rejections are not).
    """

    def __init__(
        self,
        message: str,
        err_code: int,
        err_msg: str | None = None,
        moderation_type: str = "unknown",
        retryable: bool = False,
    ):
        super().__init__(message, err_code=err_code, err_msg=err_msg)
        self.moderation_type = moderation_type
        self.retryable = retryable


# Backwards compatibility alias
# Some legacy integrations referenced APIERROR instead of APIError.
# Provide APIERROR as an alias so those code paths continue to work.
APIERROR = APIError
