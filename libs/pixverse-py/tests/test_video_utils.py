"""
Unit tests for video_utils module
Tests pure utility functions for video dimension calculations
"""

import pytest
from pixverse.video_utils import infer_video_dimensions


class TestInferVideoDimensions:
    """Test infer_video_dimensions function"""

    def test_720p_16_9(self):
        """Test 720p with 16:9 aspect ratio"""
        width, height = infer_video_dimensions("720p", "16:9")
        assert width == 1280
        assert height == 720

    def test_720p_9_16(self):
        """Test 720p with 9:16 aspect ratio (portrait)"""
        width, height = infer_video_dimensions("720p", "9:16")
        assert width == 720
        assert height == 1280

    def test_1080p_16_9(self):
        """Test 1080p with 16:9 aspect ratio"""
        width, height = infer_video_dimensions("1080p", "16:9")
        assert width == 1920
        assert height == 1080

    def test_1080p_9_16(self):
        """Test 1080p with 9:16 aspect ratio (portrait)"""
        width, height = infer_video_dimensions("1080p", "9:16")
        assert width == 1080
        assert height == 1920

    def test_360p_16_9(self):
        """Test 360p with 16:9 aspect ratio"""
        width, height = infer_video_dimensions("360p", "16:9")
        assert width == 640
        assert height == 360

    def test_1_1_square(self):
        """Test 1:1 square aspect ratio"""
        width, height = infer_video_dimensions("720p", "1:1")
        assert width == 720
        assert height == 720

    def test_default_aspect_ratio(self):
        """Test that None aspect ratio defaults to 16:9"""
        width, height = infer_video_dimensions("720p", None)
        assert width == 1280
        assert height == 720

    def test_default_without_aspect_ratio(self):
        """Test calling without aspect ratio defaults to 16:9"""
        width, height = infer_video_dimensions("1080p")
        assert width == 1920
        assert height == 1080

    def test_invalid_quality_defaults_to_720p(self):
        """Test that invalid quality defaults to 720p 16:9"""
        width, height = infer_video_dimensions("540p", "16:9")
        assert width == 1280
        assert height == 720

    def test_invalid_aspect_ratio_defaults_to_720p(self):
        """Test that invalid aspect ratio defaults to 720p 16:9"""
        width, height = infer_video_dimensions("720p", "invalid")
        assert width == 1280
        assert height == 720

    def test_360p_portrait(self):
        """Test 360p with 9:16 aspect ratio"""
        width, height = infer_video_dimensions("360p", "9:16")
        assert width == 360
        assert height == 640

    def test_1080p_square(self):
        """Test 1080p with 1:1 aspect ratio"""
        width, height = infer_video_dimensions("1080p", "1:1")
        assert width == 1080
        assert height == 1080


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
