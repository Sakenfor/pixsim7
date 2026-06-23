"""Unit tests for the signal-scan scoring model (``score_metrics``).

Locks the v4 tonal-audio behaviour: only the DEEP flatness band (< 0.25) flags
broken on its own; the 0.25–0.38 mid-zone is corroboration-only (+1) and must be
joined by a corroborating axis to reach 'broken'. v3 flagged 0.25–0.32 alone
(+3), which false-flagged genuine tonal/musical clips. See plan
signal-scan-recalibration.
"""
from __future__ import annotations

from pixsim7.backend.main.services.asset.signal_analysis import (
    SUSPICIOUS_THRESHOLD,
    score_metrics,
)


def _broken(metrics, render_ratio=None) -> bool:
    return score_metrics(metrics, render_ratio=render_ratio)[1]


# ---- tonal-audio primary axis ----
def test_deep_tonal_flags_alone():
    # flatness < 0.25 → +4, suspicious on its own (no other signal present).
    score, broken = score_metrics({"spectral_flatness": 0.20})
    assert score == 4 and broken is True


def test_moderate_tonal_does_not_flag_alone():
    # 0.25–0.32 is now +1 (was +3 in v3). Alone it stays borderline, never broken.
    score, broken = score_metrics({"spectral_flatness": 0.28})
    assert score == 1 and broken is False


def test_moderate_tonal_plus_corroboration_flags():
    # +1 tonal + audio-quiet (+1) + visual-static (+1) = 3 → broken.
    assert _broken({
        "spectral_flatness": 0.28,
        "audio_rms_db": -30.0,          # audio-quiet
        "phash_first_to_last": 5,        # visual-static
    }) is True


def test_weak_tonal_does_not_flag_alone():
    # 0.32–0.38 → +1, unchanged.
    score, broken = score_metrics({"spectral_flatness": 0.36})
    assert score == 1 and broken is False


def test_clean_broadband_audio_scores_zero():
    score, broken = score_metrics({"spectral_flatness": 0.46})
    assert score == 0 and broken is False


def test_no_audio_is_not_flagged_by_tonal_axis():
    score, _ = score_metrics({"spectral_flatness": None})
    assert score == 0


# ---- render primary axis (unchanged) ----
def test_render_strong_flags_alone():
    assert _broken({}, render_ratio=0.4) is True


# ---- corroborating axes alone cap at borderline ----
def test_corroborating_axes_alone_never_break():
    # audio-quiet (+1) + visual-static (+1) = 2 → borderline, never broken.
    score, broken = score_metrics({
        "audio_rms_db": -30.0,
        "phash_first_to_last": 5,
    })
    assert score == 2 and broken is False
    assert SUSPICIOUS_THRESHOLD == 3
