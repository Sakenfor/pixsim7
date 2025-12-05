"""
Unit tests for PixverseProvider parameter mapping.

These tests focus on credit_change hints so we know the adapter
continues to surface pricing data for downstream consumers.
"""
from pixsim7.backend.main.services.provider.adapters import pixverse as pixverse_module
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.domain import OperationType


def test_pixverse_image_credit_change_included():
    provider = PixverseProvider()

    params = provider.map_parameters(
        OperationType.TEXT_TO_IMAGE,
        {
            "prompt": "test",
            "model": "qwen-image",
            "quality": "720p",
        },
    )

    assert params["credit_change"] == 5


def test_pixverse_video_credit_change_uses_estimator(monkeypatch):
    provider = PixverseProvider()

    def fake_estimator(**kwargs):
        assert kwargs["quality"] == "360p"
        assert kwargs["duration"] == 8
        assert kwargs["model"] == "v5"
        return 123

    monkeypatch.setattr(pixverse_module, "estimate_video_credit_change", fake_estimator)

    params = provider.map_parameters(
        OperationType.TEXT_TO_VIDEO,
        {
            "prompt": "loop",
            "duration": 8,
            "quality": "360p",
            "model": "v5",
        },
    )

    assert params["credit_change"] == 123
