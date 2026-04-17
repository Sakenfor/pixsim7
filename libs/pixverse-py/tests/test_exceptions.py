"""
Unit tests for pixverse/exceptions.py
Tests custom exception classes
"""

import pytest
from pixverse.exceptions import (
    PixverseError,
    AuthenticationError,
    APIError,
    RateLimitError,
    VideoNotFoundError,
    InsufficientCreditsError
)


class TestPixverseError:
    """Test base PixverseError exception"""

    def test_pixverse_error_message(self):
        """Test PixverseError with message"""
        error = PixverseError("Test error message")
        assert str(error) == "Test error message"

    def test_pixverse_error_inheritance(self):
        """Test that PixverseError inherits from Exception"""
        error = PixverseError("Test")
        assert isinstance(error, Exception)


class TestAuthenticationError:
    """Test AuthenticationError exception"""

    def test_authentication_error_message(self):
        """Test AuthenticationError with message"""
        error = AuthenticationError("Invalid credentials")
        assert str(error) == "Invalid credentials"

    def test_authentication_error_inheritance(self):
        """Test that AuthenticationError inherits from PixverseError"""
        error = AuthenticationError("Test")
        assert isinstance(error, PixverseError)
        assert isinstance(error, Exception)


class TestAPIError:
    """Test APIError exception"""

    def test_api_error_basic(self):
        """Test basic APIError"""
        error = APIError("API request failed")
        assert str(error) == "API request failed"

    def test_api_error_with_status_code(self):
        """Test APIError with status code"""
        error = APIError("Not found", status_code=404)
        assert error.status_code == 404
        assert str(error) == "Not found"

    def test_api_error_with_response(self):
        """Test APIError with response object"""
        mock_response = type('Response', (), {'status_code': 500, 'text': 'Server Error'})()
        error = APIError("Server error", status_code=500, response=mock_response)

        assert error.status_code == 500
        assert error.response == mock_response

    def test_api_error_inheritance(self):
        """Test that APIError inherits from PixverseError"""
        error = APIError("Test")
        assert isinstance(error, PixverseError)


class TestRateLimitError:
    """Test RateLimitError exception"""

    def test_rate_limit_error_basic(self):
        """Test basic RateLimitError"""
        error = RateLimitError("Rate limit exceeded")
        assert str(error) == "Rate limit exceeded"
        assert error.retry_after is None

    def test_rate_limit_error_with_retry_after(self):
        """Test RateLimitError with retry_after"""
        error = RateLimitError("Rate limit exceeded", retry_after=60)
        assert error.retry_after == 60
        assert str(error) == "Rate limit exceeded"

    def test_rate_limit_error_inheritance(self):
        """Test that RateLimitError inherits from APIError"""
        error = RateLimitError("Test")
        assert isinstance(error, APIError)
        assert isinstance(error, PixverseError)


class TestVideoNotFoundError:
    """Test VideoNotFoundError exception"""

    def test_video_not_found_error(self):
        """Test VideoNotFoundError"""
        error = VideoNotFoundError("Video 123 not found")
        assert str(error) == "Video 123 not found"

    def test_video_not_found_error_inheritance(self):
        """Test that VideoNotFoundError inherits from APIError"""
        error = VideoNotFoundError("Test")
        assert isinstance(error, APIError)
        assert isinstance(error, PixverseError)


class TestInsufficientCreditsError:
    """Test InsufficientCreditsError exception"""

    def test_insufficient_credits_error(self):
        """Test InsufficientCreditsError"""
        error = InsufficientCreditsError("Not enough credits")
        assert str(error) == "Not enough credits"

    def test_insufficient_credits_error_inheritance(self):
        """Test that InsufficientCreditsError inherits from APIError"""
        error = InsufficientCreditsError("Test")
        assert isinstance(error, APIError)
        assert isinstance(error, PixverseError)


class TestExceptionRaising:
    """Test that exceptions can be raised and caught properly"""

    def test_raise_and_catch_authentication_error(self):
        """Test raising and catching AuthenticationError"""
        with pytest.raises(AuthenticationError, match="Invalid credentials"):
            raise AuthenticationError("Invalid credentials")

    def test_raise_and_catch_api_error(self):
        """Test raising and catching APIError"""
        with pytest.raises(APIError, match="Request failed"):
            raise APIError("Request failed", status_code=500)

    def test_raise_and_catch_rate_limit_error(self):
        """Test raising and catching RateLimitError"""
        with pytest.raises(RateLimitError, match="Too many requests"):
            raise RateLimitError("Too many requests", retry_after=30)

    def test_catch_specific_as_base_exception(self):
        """Test catching specific exception as base PixverseError"""
        with pytest.raises(PixverseError):
            raise AuthenticationError("Test")

        with pytest.raises(PixverseError):
            raise APIError("Test")

        with pytest.raises(PixverseError):
            raise RateLimitError("Test")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
