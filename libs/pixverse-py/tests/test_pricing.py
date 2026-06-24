"""Pricing tests — focus on native-audio billing.

v6 / pixverse-c1 bill native audio as +25% of the per-second video base rate
(rounded up). Legacy models (v5.5/v5.6) keep the flat NATIVE_AUDIO_COST.
Confirmed against the Pixverse site: v6 360p+audio 15s=75, 14s=70, 10s=50, and
15s+audio across resolutions 540p=113, 720p=150, 1080p=300.
"""
import pytest

from pixverse.pricing import calculate_cost, NATIVE_AUDIO_COST


@pytest.mark.parametrize("model", ["v6", "pixverse-c1"])
@pytest.mark.parametrize(
    "duration,expected",
    [(5, 25), (10, 50), (14, 70), (15, 75)],
)
def test_per_second_audio_models(model, duration, expected):
    assert calculate_cost("360p", duration, "web-api", model=model, audio=True) == expected


@pytest.mark.parametrize("model", ["v6", "pixverse-c1"])
@pytest.mark.parametrize("duration,expected", [(5, 20), (10, 40), (15, 60)])
def test_per_second_audio_video_only_unchanged(model, duration, expected):
    # Without audio the rate is the plain 4 credits/sec base.
    assert calculate_cost("360p", duration, "web-api", model=model, audio=False) == expected


@pytest.mark.parametrize("model", ["v5.5", "v5.6"])
def test_legacy_models_keep_flat_audio(model):
    base = calculate_cost("360p", 15, "web-api", model=model, audio=False)
    assert (
        calculate_cost("360p", 15, "web-api", model=model, audio=True)
        == base + NATIVE_AUDIO_COST
    )


@pytest.mark.parametrize("model", ["v6", "pixverse-c1"])
@pytest.mark.parametrize(
    "quality,expected",
    [("540p", 113), ("720p", 150), ("1080p", 300)],
)
def test_per_second_audio_scales_with_resolution(model, quality, expected):
    # 15s+audio across resolutions: base 6/8/16 +25% (540p .5 rounds up to 113).
    assert calculate_cost(quality, 15, "web-api", model=model, audio=True) == expected
