"""Pricing tests — focus on native-audio billing.

v6 / pixverse-c1 bill native audio per-second (1 credit/sec), so 360p+audio
is 5 credits/sec. Legacy models (v5.5/v5.6) keep the flat NATIVE_AUDIO_COST.
Confirmed against the Pixverse site: v6 360p+audio 15s=75, 14s=70, 10s=50.
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


def test_per_second_audio_scales_with_resolution():
    # 540p base is 6/sec; per-second audio adds 1/sec on top → 7/sec.
    assert calculate_cost("540p", 15, "web-api", model="v6", audio=True) == 6 * 15 + 15
