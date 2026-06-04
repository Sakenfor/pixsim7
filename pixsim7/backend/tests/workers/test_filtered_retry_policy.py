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
from pixsim7.backend.main.workers.worker_concurrency import resolve_filtered_retry_policy

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
