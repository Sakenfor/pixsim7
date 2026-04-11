import pytest

from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    has_retrievable_pixverse_media_url,
    is_pixverse_placeholder_url,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_status import (
    _map_pixverse_status_for,
)
from pixsim7.backend.main.domain import ProviderStatus


# ---------------------------------------------------------------------------
# Placeholder detection
# ---------------------------------------------------------------------------

def test_is_pixverse_placeholder_url_detects_default_preview_mp4():
    url = "https://media.pixverse.ai/pixverse-preview%2Fmp4%2Fmedia%2Fdefault.mp4"
    assert is_pixverse_placeholder_url(url) is True
    assert has_retrievable_pixverse_media_url(url) is False


def test_is_pixverse_placeholder_url_detects_default_image():
    url = "https://media.pixverse.ai/pixverse%2Fjpg%2Fmedia%2Fdefault.jpg"
    assert is_pixverse_placeholder_url(url) is True
    assert has_retrievable_pixverse_media_url(url) is False


# ---------------------------------------------------------------------------
# has_retrievable_pixverse_media_url — now requires output-path marker
# ---------------------------------------------------------------------------

def test_has_retrievable_for_web_ori_video():
    url = "https://media.pixverse.ai/pixverse/mp4/media/web/ori/abc123_seed1.mp4"
    assert has_retrievable_pixverse_media_url(url) is True


def test_has_retrievable_for_openapi_output_video():
    url = "https://media.pixverse.ai/openapi/output/video-abc123.mp4"
    assert has_retrievable_pixverse_media_url(url) is True


def test_has_retrievable_for_openapi_output_image():
    url = "https://media.pixverse.ai/openapi/output/image-abc123.jpg"
    assert has_retrievable_pixverse_media_url(url) is True


def test_has_retrievable_false_for_url_without_output_marker():
    # Looks like a real pixverse.ai URL but lacks /web/ori/ or /openapi/output/
    url = "https://media.pixverse.ai/pixverse/mp4/media/web/preview/abc123.mp4"
    assert has_retrievable_pixverse_media_url(url) is False


def test_has_retrievable_false_for_empty_and_invalid():
    assert has_retrievable_pixverse_media_url(None) is False
    assert has_retrievable_pixverse_media_url("") is False
    assert has_retrievable_pixverse_media_url("not-a-valid-url-value") is False


# ---------------------------------------------------------------------------
# _map_pixverse_status_for — image vs video code differences
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("code, expected", [
    (1,  ProviderStatus.COMPLETED),    # completed for both
    (10, ProviderStatus.PROCESSING),   # 10 without dimensions = early-queue echo, NOT completed
    (5,  ProviderStatus.PROCESSING),
    (0,  ProviderStatus.PROCESSING),
    (2,  ProviderStatus.PROCESSING),
    (7,  ProviderStatus.FILTERED),
    (3,  ProviderStatus.FILTERED),
    (8,  ProviderStatus.FAILED),
    (9,  ProviderStatus.FAILED),
    (-1, ProviderStatus.FAILED),
    (4,  ProviderStatus.FAILED),
])
def test_map_video_status_codes(code, expected):
    assert _map_pixverse_status_for({"video_status": code}, is_image=False) == expected


def test_map_video_status_10_with_dimensions_is_completed():
    """Status 10 with valid output dimensions is a real completion."""
    payload = {"video_status": 10, "output_width": 432, "output_height": 640}
    assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.COMPLETED


def test_map_video_status_10_zero_dimensions_is_processing():
    """Status 10 with 0x0 dimensions is the initial creation echo, not completed."""
    payload = {"video_status": 10, "output_width": 0, "output_height": 0}
    assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.PROCESSING


@pytest.mark.parametrize("code, expected", [
    (1,  ProviderStatus.COMPLETED),    # completed
    (10, ProviderStatus.PROCESSING),   # 10 = EARLY QUEUE, not completed for images!
    (5,  ProviderStatus.PROCESSING),
    (0,  ProviderStatus.PROCESSING),
    (2,  ProviderStatus.PROCESSING),
    (7,  ProviderStatus.FILTERED),
    (8,  ProviderStatus.FAILED),
    (9,  ProviderStatus.FAILED),
    (99, ProviderStatus.PROCESSING),   # unknown → safe default
])
def test_map_image_status_codes(code, expected):
    assert _map_pixverse_status_for({"image_status": code}, is_image=True) == expected


def test_map_image_status_sdk_string_completed():
    # SDK normalizes image_status int → status string; make sure strings work too
    assert _map_pixverse_status_for({"image_status": None, "status": "completed"}, is_image=True) == ProviderStatus.COMPLETED


def test_map_image_status_sdk_string_processing():
    assert _map_pixverse_status_for({"image_status": None, "status": "processing"}, is_image=True) == ProviderStatus.PROCESSING
