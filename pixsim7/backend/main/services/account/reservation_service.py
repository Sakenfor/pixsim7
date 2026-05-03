"""
Generic account reservation primitive shared by automation (and any future
subsystem that needs to atomically claim a ProviderAccount across a process
boundary).

Design (plan: automation-package-extraction Phase 2b):
- The lock + atomic state mutation stay in the backend DB. After Phase 2c the
  caller's "work record" (e.g. AutomationExecution) lives in a different DB,
  so the historical pattern of holding FOR UPDATE across select+insert+enqueue
  no longer works.
- Generic across consumers: callers tag reservations with `claimed_by` so logs
  and future reconciliation tooling can attribute orphans (e.g.
  "automation:loop:42", "burner:batch:5", "manual:user:7").
- No reservations table, no auto-expiry. The token returned by reserve() is an
  opaque handle the caller passes back to release(). 1 reserve == 1 release;
  orphaned reservations stay reserved (Phase 2d adds the compensating release
  on enqueue failure; auto-expiry is a separate problem).
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.automation.protocols import ReservationToken
from pixsim7.backend.main.domain.providers import ProviderAccount


@dataclass(frozen=True, slots=True)
class Reservation:
    """Internal result of a successful reserve() — the locked account + token."""

    account: ProviderAccount
    token: ReservationToken


class AccountReservationService:
    """Reserve and release ProviderAccount rows atomically.

    Caller owns the AsyncSession (same convention as AccountService). The
    backend adapter (BackendAccountLookup) opens a fresh session per call so
    the protocol surface stays session-free.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def reserve(
        self,
        account_id: int,
        *,
        claimed_by: str,
        wait_for_lock: bool = False,
    ) -> Optional[Reservation]:
        """Atomically claim one slot on the account.

        With `wait_for_lock=False` (default), uses FOR UPDATE SKIP LOCKED —
        contended rows return None immediately so iterate-candidate flows
        (the loop service) can fan out without blocking. The capacity filter
        in the WHERE clause means a row at max_concurrent_jobs also returns
        None even if not locked.

        With `wait_for_lock=True`, uses plain FOR UPDATE — the call blocks
        until any concurrent reserver commits, then re-evaluates capacity on
        the now-current row. Right for "I want THIS specific account" flows
        where the SKIP LOCKED None would be a false negative (the contender
        was about to commit and free up new state to read).

        Returns Reservation(account, token) on success;
        current_processing_jobs is incremented and last_used set, then
        committed.
        """
        if wait_for_lock:
            # Two-step: lock the row unconditionally, THEN check capacity on
            # the now-current state. Putting the capacity filter in the WHERE
            # would let it short-circuit when the contender's pre-commit state
            # still showed full capacity.
            row_query = (
                select(ProviderAccount)
                .where(ProviderAccount.id == account_id)
                .with_for_update()
            )
            result = await self.db.execute(row_query)
            account = result.scalar_one_or_none()
            if account is None:
                return None
            if account.current_processing_jobs >= account.max_concurrent_jobs:
                # Held lock momentarily but row really is full now; release.
                await self.db.rollback()
                return None
        else:
            query = (
                select(ProviderAccount)
                .where(
                    ProviderAccount.id == account_id,
                    ProviderAccount.current_processing_jobs
                    < ProviderAccount.max_concurrent_jobs,
                )
                .with_for_update(skip_locked=True)
            )
            result = await self.db.execute(query)
            account = result.scalar_one_or_none()
            if account is None:
                return None

        now = datetime.now(timezone.utc)
        account.current_processing_jobs += 1
        account.last_used = now
        await self.db.commit()
        await self.db.refresh(account)

        token = ReservationToken(
            account_id=account.id,
            claimed_by=claimed_by,
            reserved_at=now,
            nonce=uuid.uuid4().hex,
        )
        return Reservation(account=account, token=token)

    async def release(self, token: ReservationToken) -> None:
        """Return the slot to the pool.

        Decrements current_processing_jobs (clamped at 0). The token's role is
        contract-only — nothing in the DB enforces "only the holder may
        release", but telemetry can join `claimed_by` against the call site.

        Idempotency: if the account is missing or already at 0, this is a
        no-op (no exception). Phase 2d's compensating release on enqueue
        failure relies on this being safe to call after partial state.
        """
        query = (
            select(ProviderAccount)
            .where(ProviderAccount.id == token.account_id)
            .with_for_update()
        )
        result = await self.db.execute(query)
        account = result.scalar_one_or_none()
        if account is None:
            return
        if account.current_processing_jobs > 0:
            account.current_processing_jobs -= 1
            await self.db.commit()
