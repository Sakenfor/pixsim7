"""
Protocol-stability snapshot for the automation sibling package.

Pins the wire shape of every protocol + DTO that crosses the
backend↔automation boundary. Any change here is an intentional commitment
that needs a paired protocol edit, since Phase-2/3 splits will be wire-broken
by silent drift.
"""
from __future__ import annotations

import dataclasses
import inspect
from typing import get_type_hints

import pytest

from pixsim7.automation.protocols import (
    AccountLookup,
    AccountSnapshot,
    JobQueue,
    PathRegistry,
    PixverseAdTask,
    ProviderMetadataLookup,
    ReservationToken,
)


def _method_signature(cls, method_name: str) -> str:
    return str(inspect.signature(getattr(cls, method_name)))


def _public_method_names(cls) -> list[str]:
    return sorted(
        name for name, attr in inspect.getmembers(cls)
        if inspect.isfunction(attr) and not name.startswith("_")
    )


def _public_property_names(cls) -> list[str]:
    return sorted(
        name for name, attr in inspect.getmembers(cls)
        if isinstance(attr, property) and not name.startswith("_")
    )


def _field_names(dc) -> list[str]:
    return [f.name for f in dataclasses.fields(dc)]


# ── AccountLookup ──────────────────────────────────────────────────────


def test_account_lookup_method_surface() -> None:
    assert _public_method_names(AccountLookup) == [
        "get",
        "list_active",
        "release_reservation",
        "reserve_account",
    ]


def test_account_lookup_get_signature() -> None:
    assert _method_signature(AccountLookup, "get") == (
        "(self, account_id: 'int') -> 'Optional[AccountSnapshot]'"
    )


def test_account_lookup_list_active_signature() -> None:
    assert _method_signature(AccountLookup, "list_active") == (
        "(self, *, provider_id: 'Optional[str]' = None, "
        "account_ids: 'Optional[Sequence[int]]' = None, "
        "exclude_account_ids: 'Optional[Sequence[int]]' = None) "
        "-> 'list[AccountSnapshot]'"
    )


def test_account_lookup_reserve_account_signature() -> None:
    assert _method_signature(AccountLookup, "reserve_account") == (
        "(self, account_id: 'int', *, claimed_by: 'str', wait_for_lock: 'bool' = False) "
        "-> 'Optional[tuple[AccountSnapshot, ReservationToken]]'"
    )


def test_account_lookup_release_reservation_signature() -> None:
    assert _method_signature(AccountLookup, "release_reservation") == (
        "(self, token: 'ReservationToken') -> 'None'"
    )


# ── ProviderMetadataLookup ─────────────────────────────────────────────


def test_provider_metadata_lookup_method_surface() -> None:
    assert _public_method_names(ProviderMetadataLookup) == [
        "pixverse_ad_task",
        "refresh_account_credits",
    ]


def test_pixverse_ad_task_signature() -> None:
    assert _method_signature(ProviderMetadataLookup, "pixverse_ad_task") == (
        "(self, account_id: 'int') -> 'Optional[PixverseAdTask]'"
    )


def test_refresh_account_credits_signature() -> None:
    assert _method_signature(ProviderMetadataLookup, "refresh_account_credits") == (
        "(self, account_id: 'int') -> 'None'"
    )


# ── JobQueue ───────────────────────────────────────────────────────────


def test_job_queue_method_surface() -> None:
    assert _public_method_names(JobQueue) == ["enqueue_automation"]


def test_enqueue_automation_signature() -> None:
    assert _method_signature(JobQueue, "enqueue_automation") == (
        "(self, execution_id: 'int') -> 'str'"
    )


# ── PathRegistry ───────────────────────────────────────────────────────


def test_path_registry_property_surface() -> None:
    assert _public_property_names(PathRegistry) == ["automation_screenshots_root"]


def test_path_registry_has_no_methods() -> None:
    assert _public_method_names(PathRegistry) == []


# ── DTO field names ────────────────────────────────────────────────────


def test_account_snapshot_fields() -> None:
    assert _field_names(AccountSnapshot) == [
        "id",
        "email",
        "provider_id",
        "resolved_password",
        "user_id",
        "total_credits",
    ]


def test_reservation_token_fields() -> None:
    assert _field_names(ReservationToken) == [
        "account_id",
        "claimed_by",
        "reserved_at",
        "nonce",
    ]


def test_pixverse_ad_task_fields() -> None:
    assert _field_names(PixverseAdTask) == [
        "total_counts",
        "progress",
        "completed_counts",
    ]


# ── DTOs are frozen + slotted (Phase-3 wire-stability commitment) ─────


def test_dtos_are_frozen_and_slotted() -> None:
    for dc in (AccountSnapshot, ReservationToken, PixverseAdTask):
        params = dc.__dataclass_params__
        assert params.frozen, f"{dc.__name__} must be frozen=True"
        assert params.slots, f"{dc.__name__} must be slots=True"


# ── Type hints resolve cleanly ────────────────────────────────────────


def test_dto_type_hints_resolve() -> None:
    for dc in (AccountSnapshot, ReservationToken, PixverseAdTask):
        get_type_hints(dc)
