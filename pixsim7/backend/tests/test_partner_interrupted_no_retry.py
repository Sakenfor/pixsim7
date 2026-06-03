"""
Regression test for the happyhorse-1.0 / grok-imagine retry-loop bug.

Pre-fix: fal-proxied "interrupted" status (video_status=8) mapped to
ProviderStatus.FILTERED → CONTENT_FILTERED error_code → retryable → infinite
retry loop on inputs that fal deterministically refuses.

Post-fix: a partner-interrupt is detected via raw video_status + fal_proxied
spec flag, and routed to EXTERNAL_PARTNER_REFUSED, which is NOT in
RETRYABLE_ERROR_CODES.
"""
from types import SimpleNamespace

from pixsim7.backend.main.domain.enums import (
    GenerationErrorCode,
    RETRYABLE_ERROR_CODES,
)
from pixsim7.backend.main.workers.status_poller import (
    _is_partner_interrupted_filter,
)


def test_external_partner_refused_is_not_retryable():
    # Core regression: the new code MUST NOT be in the retryable set, or the
    # retry loop comes back.
    assert (
        GenerationErrorCode.EXTERNAL_PARTNER_REFUSED not in RETRYABLE_ERROR_CODES
    ), (
        "EXTERNAL_PARTNER_REFUSED is non-retryable by design — input is the "
        "trigger, retrying same input is futile."
    )


def _make_status_result(provider_status):
    return SimpleNamespace(metadata={"provider_status": provider_status})


def _make_generation(model):
    return SimpleNamespace(canonical_params={"model": model} if model else {})


def test_detects_happyhorse_interrupted():
    status_result = _make_status_result(provider_status=8)
    generation = _make_generation(model="happyhorse-1.0")
    assert _is_partner_interrupted_filter(status_result, generation) is True


def test_detects_grok_imagine_interrupted():
    status_result = _make_status_result(provider_status=8)
    generation = _make_generation(model="grok-imagine")
    assert _is_partner_interrupted_filter(status_result, generation) is True


def test_does_not_misfire_for_native_v6_status_8():
    # v6 video_status=8 = genuine failure, NOT partner-interrupt. Must fall
    # through so caller uses CONTENT_FILTERED / PROVIDER_GENERIC as before.
    status_result = _make_status_result(provider_status=8)
    generation = _make_generation(model="v6")
    assert _is_partner_interrupted_filter(status_result, generation) is False


def test_does_not_misfire_for_status_other_than_8():
    # video_status=7 (Pixverse-side filter) is a real content filter, not a
    # partner-interrupt — so this detector must stay False. (Downstream, the
    # poller routes pixverse status-7 to the salvage probe → either an
    # early-CDN-filtered COMPLETED or the terminal CONTENT_RENDER_MODERATED.)
    status_result = _make_status_result(provider_status=7)
    generation = _make_generation(model="happyhorse-1.0")
    assert _is_partner_interrupted_filter(status_result, generation) is False


def test_returns_false_when_model_unknown():
    # Conservative: missing/unknown model → don't mark as partner-interrupted.
    status_result = _make_status_result(provider_status=8)
    generation = _make_generation(model="unknown-model")
    assert _is_partner_interrupted_filter(status_result, generation) is False


def test_returns_false_when_metadata_missing_provider_status():
    # If the raw status didn't propagate (defensive), don't claim interrupted.
    status_result = SimpleNamespace(metadata={})
    generation = _make_generation(model="happyhorse-1.0")
    assert _is_partner_interrupted_filter(status_result, generation) is False
