"""
Shared provider-account credit sync helpers.

Centralizes:
- provider credit-type resolution
- credit snapshot filtering
- DB credit row updates + synced timestamp stamping
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Mapping, TYPE_CHECKING

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.providers import ProviderAccount
    from pixsim7.backend.main.services.account.account_service import AccountService


_DEFAULT_CREDIT_TYPES: tuple[str, ...] = ("web", "openapi", "standard", "usage")


def _normalize_credit_type(value: Any) -> str | None:
    token = str(value or "").strip().lower()
    if not token:
        return None
    return token


def _coerce_credit_amount(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_provider_credit_types(
    provider: Any,
    *,
    fallback: Iterable[str] | None = None,
) -> list[str]:
    """
    Resolve valid credit pools for a provider.

    Falls back to caller-provided values (or a conservative default set) when
    provider metadata does not expose credit pools.
    """
    raw_types: Iterable[Any] | None = None
    get_credit_types = getattr(provider, "get_credit_types", None)
    if callable(get_credit_types):
        try:
            raw_types = get_credit_types()
        except Exception:
            raw_types = None

    if raw_types is None:
        raw_types = fallback if fallback is not None else _DEFAULT_CREDIT_TYPES

    normalized: list[str] = []
    for item in raw_types:
        token = _normalize_credit_type(item)
        if token and token not in normalized:
            normalized.append(token)
    return normalized


def filter_provider_credit_snapshot(
    provider: Any,
    credits_data: Mapping[str, Any] | None,
    *,
    fallback_credit_types: Iterable[str] | None = None,
) -> dict[str, int]:
    """
    Keep only valid credit pools and coerce amounts to ints.
    """
    if not isinstance(credits_data, Mapping):
        return {}

    valid_types = set(
        get_provider_credit_types(provider, fallback=fallback_credit_types),
    )
    filtered: dict[str, int] = {}
    for credit_type, amount in credits_data.items():
        token = _normalize_credit_type(credit_type)
        if not token or token not in valid_types:
            continue
        numeric = _coerce_credit_amount(amount)
        if numeric is None:
            continue
        filtered[token] = numeric
    return filtered


async def apply_provider_credit_snapshot(
    *,
    account_service: "AccountService",
    account: "ProviderAccount",
    provider: Any,
    credits_data: Mapping[str, Any] | None,
    fallback_credit_types: Iterable[str] | None = None,
    stamp_synced_at: bool = True,
    synced_at: datetime | None = None,
    amount_transform: Callable[[str, int], int] | None = None,
    on_set_credit_error: Callable[[str, int, Exception], None] | None = None,
) -> dict[str, int]:
    """
    Persist a provider credit snapshot and return updated credit rows.
    """
    filtered = filter_provider_credit_snapshot(
        provider,
        credits_data,
        fallback_credit_types=fallback_credit_types,
    )
    if not filtered:
        return {}

    updated: dict[str, int] = {}
    for credit_type, amount in filtered.items():
        numeric = amount_transform(credit_type, amount) if amount_transform else amount
        try:
            await account_service.set_credit(account.id, credit_type, numeric)
            updated[credit_type] = numeric
        except Exception as exc:  # pragma: no cover - defensive; caller controls logging
            if on_set_credit_error is not None:
                on_set_credit_error(credit_type, numeric, exc)

    if stamp_synced_at and updated:
        now = synced_at or datetime.now(timezone.utc)
        metadata = dict(getattr(account, "provider_metadata", None) or {})
        metadata["credits_synced_at"] = now.isoformat()
        account.provider_metadata = metadata

    return updated

