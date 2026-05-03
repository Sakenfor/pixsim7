from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol, Sequence


@dataclass(frozen=True, slots=True)
class AccountSnapshot:
    """Account data as automation sees it.

    `resolved_password` is the password automation should use — backend's
    adapter does the account-password-else-provider-global-password fallback
    and ships the result here. Automation never sees provider settings.
    """

    id: int
    email: str
    provider_id: str
    resolved_password: Optional[str]


@dataclass(frozen=True, slots=True)
class ReservationToken:
    """Opaque handle returned by reserve_for_automation, passed back to
    release_reservation. Backend uses claimed_by for telemetry/orphan
    attribution; nonce is a one-shot id reserved for future idempotency
    tooling. Plan: automation-package-extraction Phase 2b.
    """

    account_id: int
    claimed_by: str
    reserved_at: datetime
    nonce: str


class AccountLookup(Protocol):
    """Backend-side account queries needed by automation."""

    async def get(self, account_id: int) -> Optional[AccountSnapshot]:
        """Fetch a single account snapshot, or None if missing."""
        ...

    async def list_active(
        self,
        *,
        provider_id: Optional[str] = None,
        account_ids: Optional[Sequence[int]] = None,
        exclude_account_ids: Optional[Sequence[int]] = None,
    ) -> list[AccountSnapshot]:
        """Return ACTIVE accounts matching the filters, for loop eligibility.

        - provider_id: restrict to one provider (optional).
        - account_ids: restrict to these ids (LoopSelectionMode.SPECIFIC_ACCOUNTS).
        - exclude_account_ids: accounts currently in-flight to skip.
        """
        ...

    async def reserve_account(
        self,
        account_id: int,
        *,
        claimed_by: str,
        wait_for_lock: bool = False,
    ) -> Optional[tuple[AccountSnapshot, ReservationToken]]:
        """Atomically claim one slot on the account.

        Backend does SELECT FOR UPDATE + capacity check + state mutation in a
        single transaction on its own DB. Returns None if the account doesn't
        exist or is already at max_concurrent_jobs.

        `claimed_by`: free-form caller tag for telemetry / orphan attribution
        (e.g. "automation:loop:42", "burner:batch:5", "manual:user:7").

        `wait_for_lock`:
          - False (default, SKIP LOCKED) — if another reserver holds the row
            lock right now, returns None instead of blocking. Right for
            iterate-candidates flows: caller tries the next account.
          - True (plain FOR UPDATE) — blocks until any concurrent reserver
            commits, then re-evaluates capacity. Right for "I want THIS
            specific account" flows where None-on-contention would be a false
            negative (capacity may still be available after the holder commits).

        On success, returns (snapshot, token). The caller must pass the token
        back to release_reservation if it later needs to roll back the claim
        (Phase 2d: compensating release on enqueue failure).
        """
        ...

    async def release_reservation(self, token: ReservationToken) -> None:
        """Return the slot reserved by a prior reserve_account call.

        Idempotent — safe to call after partial-failure paths. No auto-expiry;
        orphaned reservations stay reserved until explicitly released or
        reconciled by maintenance tooling.
        """
        ...
