"""Tunable score-time thresholds for the broken-video heuristic.

Every constant the scorer (:mod:`signal_analysis.score_metrics` and its helpers)
reads at SCORE time lives here as a field, so the whole model can be:

* persisted in ``MediaSettings.signal_scoring`` and edited from the Video-Health
  tuning panel,
* re-applied to the library with a cheap **rescore** (no reprobe) — these are all
  read when scoring stored metrics, never during the ffmpeg probe, so changing
  them never requires re-decoding,
* previewed against the user's broken/clean labels before committing (the
  calibration preview re-scores the labelled clips with a candidate instance).

Probe-time constants (``FRAME_TONAL_FLATNESS``, ``SPECTRAL_*``, ``CHROMA_POOL_BINS``,
``MIN_SPECTRAL_FRAMES``, ``PROBE_TIMEOUT_SEC``) deliberately stay module constants
in :mod:`signal_analysis` — changing them DOES require a reprobe, so they are not
live-tunable and don't belong here.

This module is import-cheap (pydantic only) on purpose: both
:mod:`signal_analysis` and :mod:`services.media.settings` import it, and the
settings module loads early in app startup. Keep it free of ORM / heavy imports.

The field defaults are the single source of truth for the scorer's defaults —
:mod:`signal_analysis` derives its back-compat module constants (``RMS_DB_THRESHOLD``
etc.) from a default instance so the two can never drift.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ScoringParams(BaseModel):
    """All score-time-tunable thresholds for the broken-video scorer.

    Defaults reproduce the v5 hand-tuned model exactly. See
    :mod:`signal_analysis` for the rationale behind each axis.
    """

    model_config = {"extra": "ignore"}

    # ── Audio-fingerprint match (PRIMARY) — loudness-aware ladder ──────────
    audio_ref_match_strong_hi: float = Field(
        0.70,
        ge=0.0,
        le=1.0,
        description="Match >= this → +4 unconditionally (flags broken alone, LRA-independent).",
    )
    audio_ref_match_strong: float = Field(
        0.60,
        ge=0.0,
        le=1.0,
        description="Strong band floor: narrowband → +4 (flags alone), loud → +2 (needs corroboration).",
    )
    audio_ref_match_weak: float = Field(
        0.50,
        ge=0.0,
        le=1.0,
        description="Weak band floor: narrowband → +2, loud → +1 (corroboration-only).",
    )
    audio_ref_lra_gate: float = Field(
        12.0,
        ge=0.0,
        le=60.0,
        description=(
            "Loudness range (dB) below which audio is 'narrowband' (synthetic broken "
            "voice/hum); at or above it the clip is a dynamic soundtrack and a borderline "
            "melody match is down-weighted to avoid the good-melody false positive."
        ),
    )

    # ── Render time vs cohort median (PRIMARY) ─────────────────────────────
    render_ratio_strong: float = Field(
        0.5, ge=0.0, le=2.0,
        description="render sec / cohort p50 below this → +4 (strong fast-fail; flags alone).",
    )
    render_ratio_moderate: float = Field(
        0.7, ge=0.0, le=2.0,
        description="Render ratio below this → +2.",
    )
    render_ratio_weak: float = Field(
        0.85, ge=0.0, le=2.0,
        description="Render ratio below this → +1.",
    )

    # ── Near-silence (PRIMARY audio-level) ─────────────────────────────────
    rms_silence_threshold: float = Field(
        -40.0, ge=-120.0, le=0.0,
        description="rms dBFS below this → near-silent (primary; flags ~alone via silence_points).",
    )
    silence_points: int = Field(
        3, ge=0, le=6,
        description="Points awarded for near-silence (3 = enough to flag alone at the default suspicious threshold).",
    )

    # ── Corroborating axes (≤ +1 each) ─────────────────────────────────────
    rms_db_threshold: float = Field(
        -25.0, ge=-120.0, le=0.0,
        description="audio-quiet axis: rms dBFS below this → +1 corroboration.",
    )
    peak_db_threshold: float = Field(
        -8.0, ge=-120.0, le=0.0,
        description="audio-quiet axis: peak dBFS below this → +1 corroboration.",
    )
    phash_first_to_last_threshold: int = Field(
        20, ge=0, le=64,
        description="visual-static axis: first→last frame dhash divergence below this → +1.",
    )
    phash_mean_div_threshold: float = Field(
        22.0, ge=0.0, le=64.0,
        description="visual-static axis: mean dhash divergence-from-first below this → +1.",
    )
    flatness_weak: float = Field(
        0.38, ge=0.0, le=1.0,
        description="tonal-flatness corroboration: median spectral flatness below this → +1 (never flags alone).",
    )
    tonal_frac_threshold: float = Field(
        0.55, ge=0.0, le=1.0,
        description="sustained-tonal corroboration: fraction of tonal frames above this → +1.",
    )

    # ── Decision threshold ─────────────────────────────────────────────────
    suspicious_threshold: int = Field(
        3, ge=1, le=12,
        description="score >= this is flagged broken (suspicious).",
    )
