from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.domain.enums import OperationType
from pixsim7.backend.main.workers.job_processor_account import (
    has_positive_credits,
    has_sufficient_credits,
    resolve_required_credit_types,
)


def _generation(
    *,
    operation_type: OperationType = OperationType.IMAGE_TO_VIDEO,
    provider_id: str = "pixverse",
    canonical_params: dict | None = None,
    raw_params: dict | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        provider_id=provider_id,
        operation_type=operation_type,
        canonical_params=canonical_params or {},
        raw_params=raw_params or {},
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
