"""Unit tests for the shared video frame-grab helpers in derivatives.py.

Covers the pure timestamp-spacing logic extracted in plan
``embedding-input-selection-media-aware`` (c1). The ffmpeg-driven
``extract_video_frame`` is exercised indirectly by thumbnail/preview generation
and is not unit-tested here (requires an ffmpeg binary + a real clip).
"""
from pixsim7.backend.main.services.media.derivatives import (
    DEFAULT_FRAME_SIZE,
    evenly_spaced_timestamps,
)


def test_default_frame_size_is_model_resolution():
    # SigLIP2-large runs at 384px; grab at model res, not the 320 thumbnail size.
    assert DEFAULT_FRAME_SIZE == (384, 384)


def test_evenly_spaced_skips_first_and_last_frame():
    # Interior points at (i+1)/(n+1) of duration — never 0.0 or the final frame.
    assert evenly_spaced_timestamps(10.0, 3) == [2.5, 5.0, 7.5]


def test_evenly_spaced_single_frame_is_midpoint():
    assert evenly_spaced_timestamps(10.0, 1) == [5.0]


def test_evenly_spaced_count_matches_request():
    assert len(evenly_spaced_timestamps(60.0, 5)) == 5


def test_evenly_spaced_unknown_duration_falls_back_to_single_grab():
    # No duplicate timestamps when duration is unknown — best-effort first frame.
    assert evenly_spaced_timestamps(None, 3) == [0.0]
    assert evenly_spaced_timestamps(0, 5) == [0.0]


def test_evenly_spaced_clamps_nonpositive_count():
    assert evenly_spaced_timestamps(10.0, 0) == [5.0]
    assert evenly_spaced_timestamps(10.0, -2) == [5.0]
