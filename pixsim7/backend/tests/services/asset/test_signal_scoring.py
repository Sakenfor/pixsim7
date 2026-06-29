"""Unit tests for the signal-scan scoring model (``score_metrics``).

Locks the v5 audio behaviour: the audio-fingerprint match is the PRIMARY audio
axis (flags broken on its own), and tonal flatness is DEMOTED to a corroborating
axis worth at most +1 — ANY flatness below 0.38 nudges +1 and NONE flags broken
alone, deep or shallow. (v4 still flagged the deep <0.25 band alone at +4; on 425
user labels that band did not separate broken from kept and was the main
false-positive engine — see _tonal_points / plan signal-scan-recalibration.)
"""
from __future__ import annotations

from pixsim7.backend.main.services.asset import signal_analysis as _sa
from pixsim7.backend.main.services.asset.signal_analysis import (
    SUSPICIOUS_THRESHOLD,
    score_metrics,
)
from pixsim7.backend.main.services.asset.signal_scoring_params import ScoringParams


def _broken(metrics, render_ratio=None) -> bool:
    return score_metrics(metrics, render_ratio=render_ratio)[1]


# ---- tonal-audio corroborating axis (v5: demoted, ≤ +1, never flags alone) ----
def test_deep_tonal_is_corroborating_only():
    # v5: even the deep band (< 0.25) is just +1 corroboration now — no longer
    # the v4 flags-alone +4. Alone it stays borderline, never broken.
    score, broken = score_metrics({"spectral_flatness": 0.20})
    assert score == 1 and broken is False


def test_audio_fingerprint_is_the_primary_audio_axis():
    # The new v5 primary: a strong fingerprint match (>= 0.60) flags broken alone.
    score, broken = score_metrics({}, audio_ref_match=0.65)
    assert score == 4 and broken is True
    # A weak match (>= 0.50) is +2 — needs a corroborating axis to reach broken.
    assert score_metrics({}, audio_ref_match=0.55) == (2, False)


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


# ---- tunable params (ScoringParams) ----
def test_scoringparams_defaults_match_module_constants():
    # The module constants are DERIVED from ScoringParams defaults — guard against
    # drift if someone edits one but not the other.
    p = ScoringParams()
    assert _sa.RMS_DB_THRESHOLD == p.rms_db_threshold
    assert _sa.PEAK_DB_THRESHOLD == p.peak_db_threshold
    assert _sa.RMS_SILENCE_THRESHOLD == p.rms_silence_threshold
    assert _sa.SILENCE_POINTS == p.silence_points
    assert _sa.PHASH_FIRST_TO_LAST_THRESHOLD == p.phash_first_to_last_threshold
    assert _sa.PHASH_MEAN_DIV_THRESHOLD == p.phash_mean_div_threshold
    assert _sa.RENDER_RATIO_STRONG == p.render_ratio_strong
    assert _sa.RENDER_RATIO_MODERATE == p.render_ratio_moderate
    assert _sa.RENDER_RATIO_WEAK == p.render_ratio_weak
    assert _sa.FLATNESS_WEAK == p.flatness_weak
    assert _sa.TONAL_FRAC_THRESHOLD == p.tonal_frac_threshold
    assert _sa.AUDIO_REF_MATCH_STRONG == p.audio_ref_match_strong
    assert _sa.AUDIO_REF_MATCH_WEAK == p.audio_ref_match_weak
    assert _sa.AUDIO_REF_MATCH_STRONG_HI == p.audio_ref_match_strong_hi
    assert _sa.AUDIO_REF_LRA_GATE == p.audio_ref_lra_gate
    assert _sa.SUSPICIOUS_THRESHOLD == p.suspicious_threshold


def test_candidate_params_change_the_verdict():
    # A weak fingerprint match (0.55) is +2 → not broken under defaults.
    assert score_metrics({}, audio_ref_match=0.55) == (2, False)
    # Lower the suspicious threshold to 2 → the same +2 now flags broken.
    p = ScoringParams(suspicious_threshold=2)
    assert score_metrics({}, audio_ref_match=0.55, params=p)[1] is True
    # Or lower the strong-band floor so 0.55 grades as a strong (narrowband) +4.
    p2 = ScoringParams(audio_ref_match_strong=0.50)
    score, broken = score_metrics({}, audio_ref_match=0.55, params=p2)
    assert score == 4 and broken is True


def test_render_cutoff_is_tunable():
    # Default weak cutoff is 0.85 → ratio 0.8 scores +1 (borderline, not broken).
    assert score_metrics({}, render_ratio=0.8) == (1, False)
    # Tighten the strong cutoff to 0.85 → ratio 0.8 is now a strong fast-fail (+4).
    p = ScoringParams(render_ratio_strong=0.85)
    assert score_metrics({}, render_ratio=0.8, params=p) == (4, True)
