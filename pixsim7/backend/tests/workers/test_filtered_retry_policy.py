"""Tests for resolve_filtered_retry_policy() in worker_concurrency.

Verifies the per-operation filtered-retry policy resolution:
- content_render_moderated is always active (per-op override or global default).
- content_filtered is opt-in (only when a per-op override exists), with an
  omitted cap meaning backoff-only.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from pixsim7.backend.main.domain.enums import GenerationErrorCode
from pixsim7.backend.main.workers.worker_concurrency import (
    filtered_retry_scope_key,
    resolve_filtered_retry_policy,
)

RM = GenerationErrorCode.CONTENT_RENDER_MODERATED.value
CF = GenerationErrorCode.CONTENT_FILTERED.value


def _fake_ws(overrides=None):
    # The resolver reads filtered_retry_overrides directly and the global
    # defaults via render_moderated_retry_cap()/_defer_seconds() -> _settings_int
    # -> getattr(_ws(), name, default).
    return SimpleNamespace(
        filtered_retry_overrides=overrides or {},
        render_moderated_retry_cap=10,
        render_moderated_retry_defer_seconds=20,
    )


def _with_ws(overrides=None):
    return patch(
        "pixsim7.backend.main.workers.worker_concurrency._ws",
        return_value=_fake_ws(overrides),
    )


def test_render_moderated_falls_back_to_global_default():
    with _with_ws():
        policy = resolve_filtered_retry_policy("image_to_video", RM)
    assert policy is not None
    assert policy.cap == 10
    assert policy.defer_seconds == 20


def test_render_moderated_uses_per_op_override():
    with _with_ws({"image_to_video": {"cap": 3, "defer_seconds": 30}}):
        policy = resolve_filtered_retry_policy("image_to_video", RM)
    assert policy == (3, 30)


def test_content_filtered_without_override_is_none():
    with _with_ws():
        assert resolve_filtered_retry_policy("image_to_image", CF) is None


def test_content_filtered_backoff_only_when_cap_omitted():
    with _with_ws({"image_to_image": {"defer_seconds": 45}}):
        policy = resolve_filtered_retry_policy("image_to_image", CF)
    assert policy is not None
    assert policy.cap is None  # no circuit breaker — backoff only
    assert policy.defer_seconds == 45


def test_content_filtered_with_cap_override():
    with _with_ws({"image_to_image": {"cap": 5, "defer_seconds": 60}}):
        policy = resolve_filtered_retry_policy("image_to_image", CF)
    assert policy == (5, 60)


def test_override_for_a_different_op_does_not_leak():
    with _with_ws({"image_to_video": {"cap": 2, "defer_seconds": 15}}):
        # content_filtered on i2i has no override of its own -> opt-out.
        assert resolve_filtered_retry_policy("image_to_image", CF) is None
        # render-moderated on i2i still gets the global default (always active).
        assert resolve_filtered_retry_policy("image_to_image", RM) == (10, 20)


def test_unrelated_error_code_is_none():
    with _with_ws({"image_to_video": {"cap": 3}}):
        assert resolve_filtered_retry_policy("image_to_video", "provider_quota") is None
        assert resolve_filtered_retry_policy("image_to_video", None) is None


# ── Scope-key granularity (operation + model + duration) ────────────────────

def test_scope_key_formatting():
    assert filtered_retry_scope_key("image_to_video") == "image_to_video"
    assert filtered_retry_scope_key("image_to_video", model="V6") == "image_to_video|model=v6"
    assert filtered_retry_scope_key("image_to_video", duration=8) == "image_to_video|duration=8"
    assert (
        filtered_retry_scope_key("image_to_video", model="v6", duration=8)
        == "image_to_video|model=v6|duration=8"
    )


def test_exact_model_duration_match_wins():
    overrides = {
        "image_to_video": {"cap": 10},
        "image_to_video|model=v6": {"cap": 7},
        "image_to_video|model=v6|duration=8": {"cap": 3, "defer_seconds": 30},
    }
    with _with_ws(overrides):
        policy = resolve_filtered_retry_policy(
            "image_to_video", RM, {"model": "v6", "duration": 8}
        )
    assert policy == (3, 30)


def test_falls_back_model_only_then_op():
    overrides = {
        "image_to_video": {"cap": 10},
        "image_to_video|model=v6": {"cap": 7, "defer_seconds": 25},
    }
    with _with_ws(overrides):
        # v6 at duration 5 has no exact key -> model-only override.
        assert resolve_filtered_retry_policy("image_to_video", RM, {"model": "v6", "duration": 5}) == (7, 25)
        # v5 has no model override at all -> op-level.
        assert resolve_filtered_retry_policy("image_to_video", RM, {"model": "v5", "duration": 5}) == (10, 20)


def test_model_wins_over_duration_when_both_standalone():
    overrides = {
        "image_to_video|model=v6": {"cap": 7},
        "image_to_video|duration=8": {"cap": 4},
    }
    with _with_ws(overrides):
        # gen is v6 + 8s; both standalone overrides exist; model takes precedence.
        policy = resolve_filtered_retry_policy("image_to_video", RM, {"model": "v6", "duration": 8})
    assert policy.cap == 7


def test_duration_only_override_matches():
    with _with_ws({"image_to_video|duration=8": {"cap": 4, "defer_seconds": 40}}):
        assert resolve_filtered_retry_policy("image_to_video", RM, {"model": "v5", "duration": 8}) == (4, 40)


def test_content_filtered_granular_opt_in():
    with _with_ws({"image_to_image|model=gemini-3.0": {"defer_seconds": 45}}):
        # matching model -> opt-in (backoff-only, cap None)
        p = resolve_filtered_retry_policy("image_to_image", CF, {"model": "gemini-3.0"})
        assert p is not None and p.cap is None and p.defer_seconds == 45
        # different model -> no override -> None (unchanged behavior)
        assert resolve_filtered_retry_policy("image_to_image", CF, {"model": "qwen-image"}) is None


def test_no_canonical_params_is_op_only_backcompat():
    with _with_ws({"image_to_video|model=v6": {"cap": 7}, "image_to_video": {"cap": 9}}):
        # No params -> only the op-level key is considered.
        assert resolve_filtered_retry_policy("image_to_video", RM) == (9, 20)
