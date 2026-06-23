from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.services.generation.processing.account_ops import (
    has_positive_credits,
    has_sufficient_credits,
    is_unlimited_model,
    resolve_required_credit_types,
)


def _generation(
    *,
    operation_type: OperationType = OperationType.IMAGE_TO_VIDEO,
    provider_id: str = "pixverse",
    canonical_params: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        provider_id=provider_id,
        operation_type=operation_type,
        canonical_params=canonical_params or {},
    )


def _account_with_openapi() -> SimpleNamespace:
    return SimpleNamespace(
        api_key=None,
        api_keys=[{"kind": "openapi", "value": "pk-test"}],
    )


def test_resolve_required_credit_types_web_only_operation() -> None:
    generation = _generation(operation_type=OperationType.TEXT_TO_IMAGE)
    assert resolve_required_credit_types(generation) == ["web"]


def test_resolve_required_credit_types_defaults_to_web_without_override() -> None:
    generation = _generation(operation_type=OperationType.IMAGE_TO_VIDEO)
    assert resolve_required_credit_types(generation, account=_account_with_openapi()) == ["web"]


def test_resolve_required_credit_types_respects_explicit_web_override() -> None:
    generation = _generation(
        operation_type=OperationType.IMAGE_TO_VIDEO,
        canonical_params={"api_method": "web-api"},
    )
    assert resolve_required_credit_types(generation, account=_account_with_openapi()) == ["web"]


def test_has_sufficient_credits_honors_required_credit_pool() -> None:
    credits = {"web": 0, "openapi": 42}
    assert has_sufficient_credits(credits, min_credits=1, required_credit_types=["web"]) is False
    assert has_sufficient_credits(credits, min_credits=1, required_credit_types=["openapi"]) is True


def test_has_positive_credits_honors_required_credit_pool() -> None:
    credits = {"web": 0, "openapi": 7}
    assert has_positive_credits(credits, required_credit_types=["web"]) is False
    assert has_positive_credits(credits, required_credit_types=["openapi"]) is True


# ---------------------------------------------------------------------------
# is_unlimited_model — submit-time gate, must agree with selector
# ---------------------------------------------------------------------------


def test_is_unlimited_model_normalizes_alias() -> None:
    """Regression guard: ``is_unlimited_model`` must use the same alias
    map as ``select_and_reserve_account``. Previously this was a naive
    ``model in unlimited`` check that returned False for shorthand model
    ids, then ``verify_credits`` would reject the very account selection
    chose specifically for being unlimited.
    """
    account = SimpleNamespace(
        provider_metadata={"plan_unlimited_image_models": ["seedream-4.0"]},
    )
    # Shorthand request, canonical stored — must still match.
    assert is_unlimited_model(account, "seedream-4") is True
    # Sanity: canonical → canonical still works.
    assert is_unlimited_model(account, "seedream-4.0") is True
    # Sanity: unrelated model returns False.
    assert is_unlimited_model(account, "qwen-image") is False


def test_is_unlimited_model_safe_when_metadata_missing() -> None:
    """Tolerate accounts with no metadata at all (older/test rows)."""
    assert is_unlimited_model(SimpleNamespace(provider_metadata=None), "v6") is False
    assert is_unlimited_model(SimpleNamespace(provider_metadata={}), "v6") is False
    assert is_unlimited_model(SimpleNamespace(provider_metadata={"v6": 0.7}), None) is False
