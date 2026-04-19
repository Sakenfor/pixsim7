"""
Unit tests for PixverseAPI client (pixverse/api/client.py)
Tests core HTTP functionality and error handling
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import requests
from pixverse.api.client import PixverseAPI
from pixverse.models import Account, Video, GenerationOptions
from pixverse.exceptions import APIError, RateLimitError


@pytest.fixture
def mock_account():
    """Create a mock account with JWT token"""
    return Account(
        email="test@example.com",
        password="password",
        session={
            "jwt_token": "mock_jwt_token",
            "cookies": {"session": "mock_session"}
        }
    )


@pytest.fixture
def mock_openapi_account():
    """Create a mock account with OpenAPI key"""
    return Account(
        email="test@example.com",
        password="password",
        session={
            "openapi_key": "mock_openapi_key"
        }
    )


@pytest.fixture
def api_client():
    """Create PixverseAPI instance"""
    return PixverseAPI()


class TestPixverseAPIInit:
    """Test PixverseAPI initialization"""

    def test_init_default_base_url(self):
        """Test initialization with default base URL"""
        api = PixverseAPI()
        assert api.base_url == "https://app-api.pixverse.ai"
        assert api.session is not None

    def test_init_custom_base_url(self):
        """Test initialization with custom base URL"""
        custom_url = "https://custom-api.pixverse.ai"
        api = PixverseAPI(base_url=custom_url)
        assert api.base_url == custom_url

    def test_init_creates_operation_modules(self):
        """Test that initialization creates operation modules"""
        api = PixverseAPI()
        assert api._video_ops is not None
        assert api._credits_ops is not None
        assert api._upload_ops is not None
        assert api._fusion_ops is not None

    def test_init_configures_session_pooling(self):
        """Test that session is configured with connection pooling"""
        api = PixverseAPI()
        # Check that adapters are mounted
        assert "https://" in api.session.adapters
        assert "http://" in api.session.adapters


class TestGetHeaders:
    """Test _get_headers method"""

    def test_get_headers_with_jwt_token(self, api_client, mock_account):
        """Test headers for JWT token authentication"""
        headers = api_client._get_headers(mock_account)

        assert "token" in headers
        assert headers["token"] == "mock_jwt_token"
        assert headers["Content-Type"] == "application/json"
        assert headers["x-platform"] == "Web"
        assert "ai-trace-id" in headers
        assert "refresh" in headers

    def test_get_headers_with_openapi_key(self, api_client, mock_openapi_account):
        """Test headers for OpenAPI key authentication"""
        headers = api_client._get_headers(mock_openapi_account)

        assert "API-KEY" in headers
        assert headers["API-KEY"] == "mock_openapi_key"
        assert headers["Content-Type"] == "application/json"
        assert "Ai-trace-id" in headers

    def test_get_headers_without_credentials(self, api_client):
        """Test that missing credentials raises error"""
        account = Account(email="test@example.com", password="password", session={})

        with pytest.raises(APIError, match="No authentication credentials"):
            api_client._get_headers(account)

    def test_get_headers_without_refresh(self, api_client, mock_account):
        """Test headers without refresh header"""
        headers = api_client._get_headers(mock_account, include_refresh=False)

        assert "refresh" not in headers


class TestCheckError:
    """Test _check_error method"""

    def test_check_error_with_success(self, api_client):
        """Test that successful response (ErrCode=0) doesn't raise"""
        data = {"ErrCode": 0, "Resp": {"video_id": "123"}}
        # Should not raise
        api_client._check_error(data)

    def test_check_error_with_generic_error(self, api_client):
        """Test that error response raises APIError"""
        data = {"ErrCode": 500, "ErrMsg": "Internal server error"}

        with pytest.raises(APIError, match="Pixverse API error 500"):
            api_client._check_error(data)

    def test_check_error_with_session_expired(self, api_client):
        """Test that session expired error (code 10005) raises appropriate error"""
        data = {"ErrCode": 10005, "ErrMsg": "Session expired"}

        with pytest.raises(APIError, match="Session expired"):
            api_client._check_error(data)


class TestRequest:
    """Test _request method"""

    @patch('pixverse.api.client.requests.Session.request')
    def test_request_success(self, mock_request, api_client, mock_account):
        """Test successful API request"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ErrCode": 0, "Resp": {"data": "test"}}
        mock_request.return_value = mock_response

        result = api_client._request("POST", "/test", mock_account, json={"test": "data"})

        assert result["ErrCode"] == 0
        assert result["Resp"]["data"] == "test"
        mock_request.assert_called_once()

    @patch('pixverse.api.client.requests.Session.request')
    def test_request_rate_limit(self, mock_request, api_client, mock_account):
        """Test that 429 response raises RateLimitError"""
        mock_response = Mock()
        mock_response.status_code = 429
        mock_response.headers = {"Retry-After": "60"}
        mock_request.return_value = mock_response

        with pytest.raises(RateLimitError):
            api_client._request("POST", "/test", mock_account)

    @patch('pixverse.api.client.requests.Session.request')
    def test_request_http_error(self, mock_request, api_client, mock_account):
        """Test that HTTP error raises APIError"""
        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_request.return_value = mock_response

        with pytest.raises(APIError, match="HTTP 500 error"):
            api_client._request("POST", "/test", mock_account)

    @patch('pixverse.api.client.requests.Session.request')
    def test_request_network_error(self, mock_request, api_client, mock_account):
        """Test that network error raises APIError"""
        mock_request.side_effect = requests.RequestException("Network error")

        with pytest.raises(APIError, match="Request failed"):
            api_client._request("POST", "/test", mock_account)


class TestParseVideoResponse:
    """Test _parse_video_response method"""

    def test_parse_video_generation_response(self, api_client):
        """Test parsing video generation response"""
        data = {
            "Resp": {
                "video_ids": [123456]
            }
        }

        video = api_client._parse_video_response(data)

        assert video.id == "123456"
        assert video.status == "processing"

    def test_parse_video_details_response(self, api_client):
        """Test parsing video details response"""
        data = {
            "video_id": "123456",
            "status": 1,  # completed
            "customer_video_url": "https://example.com/video.mp4",
            "customer_video_last_frame_url": "https://example.com/thumb.jpg",
            "prompt": "Test prompt",
            "duration": 5,
            "model": "v2"
        }

        video = api_client._parse_video_response(data)

        assert video.id == "123456"
        assert video.status == "completed"
        assert video.url == "https://example.com/video.mp4"
        assert video.thumbnail == "https://example.com/thumb.jpg"
        assert video.last_frame_url == "https://example.com/thumb.jpg"
        assert video.first_frame_url is None
        assert video.prompt == "Test prompt"
        assert video.duration == 5
        assert video.model == "v2"

    def test_parse_video_frame_urls_last_frame_only(self, api_client):
        """Only `last_frame` present → last_frame_url set, first_frame_url None,
        thumbnail falls back to last_frame_url."""
        data = {
            "video_id": "1",
            "status": 1,
            "last_frame": "https://example.com/last.jpg",
        }
        video = api_client._parse_video_response(data)
        assert video.last_frame_url == "https://example.com/last.jpg"
        assert video.first_frame_url is None
        assert video.thumbnail == "https://example.com/last.jpg"

    def test_parse_video_frame_urls_first_frame_only(self, api_client):
        """Only `first_frame` present (e.g. CDN-filtered source) → last_frame_url
        stays None; thumbnail falls back to first_frame for display only.
        Consumers that need an extend seed must check last_frame_url strictly."""
        data = {
            "video_id": "1",
            "status": 1,
            "first_frame": "https://example.com/first.jpg",
        }
        video = api_client._parse_video_response(data)
        assert video.last_frame_url is None
        assert video.first_frame_url == "https://example.com/first.jpg"
        assert video.thumbnail == "https://example.com/first.jpg"

    def test_parse_video_frame_urls_both_present(self, api_client):
        """Both frames present → both typed fields populated; thumbnail prefers last."""
        data = {
            "video_id": "1",
            "status": 1,
            "last_frame": "https://example.com/last.jpg",
            "first_frame": "https://example.com/first.jpg",
        }
        video = api_client._parse_video_response(data)
        assert video.last_frame_url == "https://example.com/last.jpg"
        assert video.first_frame_url == "https://example.com/first.jpg"
        assert video.thumbnail == "https://example.com/last.jpg"

    def test_parse_video_frame_urls_none_present(self, api_client):
        """Neither frame present → both typed fields None; thumbnail falls back
        to generic `thumbnail` key if present, else None."""
        data_no_thumb = {"video_id": "1", "status": 1}
        video = api_client._parse_video_response(data_no_thumb)
        assert video.last_frame_url is None
        assert video.first_frame_url is None
        assert video.thumbnail is None

        data_generic = {"video_id": "1", "status": 1, "thumbnail": "https://example.com/generic.jpg"}
        video = api_client._parse_video_response(data_generic)
        assert video.last_frame_url is None
        assert video.first_frame_url is None
        assert video.thumbnail == "https://example.com/generic.jpg"

    def test_parse_video_frame_urls_customer_takes_priority_over_last_frame(self, api_client):
        """customer_video_last_frame_url wins over last_frame (canonical field name)."""
        data = {
            "video_id": "1",
            "status": 1,
            "customer_video_last_frame_url": "https://example.com/customer.jpg",
            "last_frame": "https://example.com/last.jpg",
        }
        video = api_client._parse_video_response(data)
        assert video.last_frame_url == "https://example.com/customer.jpg"

    def test_parse_video_status_codes(self, api_client):
        """Test status code mapping"""
        status_map = {
            1: "completed",
            10: "completed",
            5: "processing",
            7: "filtered",
            8: "failed",
            9: "failed"
        }

        for code, expected_status in status_map.items():
            data = {"video_id": "123", "status": code}
            video = api_client._parse_video_response(data)
            assert video.status == expected_status


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
