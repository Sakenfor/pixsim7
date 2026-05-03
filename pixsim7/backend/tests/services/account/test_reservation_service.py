"""
Tests for AccountReservationService.

Plan: automation-package-extraction Phase 2b. Pins:

  1. reserve() succeeds when under capacity, increments counter, returns token.
  2. reserve() returns None when at capacity (capacity filter).
  3. Concurrent reservers don't double-claim: with one connection holding the
     row's FOR UPDATE lock, a second reserver sees None thanks to SKIP LOCKED.
  4. release() returns the slot to the pool; idempotent and safe after partial
     state.
  5. wait_for_lock=True blocks while the row is held, succeeds once released,
     and still respects capacity (no false success).
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import text

from pixsim7.backend.main.services.account.reservation_service import (
    AccountReservationService,
)


pytestmark = pytest.mark.asyncio


async def _insert_account(
    session,
    *,
    email: str = "test@example.com",
    provider_id: str = "pixverse",
    max_concurrent: int = 2,
    current: int = 0,
) -> int:
    result = await session.execute(
        text(
            """
            INSERT INTO provider_accounts
                (email, provider_id, status, max_concurrent_jobs, current_processing_jobs)
            VALUES (:email, :provider_id, 'ACTIVE', :max_c, :curr)
            RETURNING id
            """
        ),
        {"email": email, "provider_id": provider_id, "max_c": max_concurrent, "curr": current},
    )
    account_id = result.scalar_one()
    await session.commit()
    return account_id


async def _read_counter(session, account_id: int) -> int:
    result = await session.execute(
        text("SELECT current_processing_jobs FROM provider_accounts WHERE id = :id"),
        {"id": account_id},
    )
    return int(result.scalar_one())


async def test_reserve_succeeds_when_under_capacity(make_session):
    session = await make_session()
    account_id = await _insert_account(session, max_concurrent=2, current=0)

    service = AccountReservationService(session)
    reservation = await service.reserve(account_id, claimed_by="automation:test")

    assert reservation is not None
    assert reservation.account.id == account_id
    assert reservation.token.account_id == account_id
    assert reservation.token.claimed_by == "automation:test"
    assert reservation.token.nonce  # uuid hex, non-empty
    assert await _read_counter(session, account_id) == 1


async def test_reserve_returns_none_when_at_capacity(make_session):
    session = await make_session()
    account_id = await _insert_account(session, max_concurrent=1, current=1)

    service = AccountReservationService(session)
    reservation = await service.reserve(account_id, claimed_by="automation:test")

    assert reservation is None
    # Counter unchanged.
    assert await _read_counter(session, account_id) == 1


async def test_reserve_returns_none_when_account_missing(make_session):
    session = await make_session()
    service = AccountReservationService(session)

    reservation = await service.reserve(999_999, claimed_by="automation:test")

    assert reservation is None


async def test_concurrent_reserve_skip_locked(make_session):
    """With one session holding FOR UPDATE on the row, a second reserver hits
    SKIP LOCKED and returns None. After the first session releases the lock,
    the second can reserve successfully.
    """
    setup_session = await make_session()
    account_id = await _insert_account(setup_session, max_concurrent=2, current=0)
    await setup_session.close()

    holder = await make_session()
    contender = await make_session()

    # Holder acquires FOR UPDATE on the row inside an open transaction.
    await holder.execute(
        text("SELECT id FROM provider_accounts WHERE id = :id FOR UPDATE"),
        {"id": account_id},
    )
    # Note: holder has NOT committed; lock is held until rollback/commit.

    # Contender attempts to reserve — should SKIP LOCKED and return None.
    contender_service = AccountReservationService(contender)
    contender_result = await contender_service.reserve(
        account_id, claimed_by="automation:contender"
    )
    assert contender_result is None

    # Holder releases the lock.
    await holder.rollback()

    # Now contender can reserve.
    contender_result = await contender_service.reserve(
        account_id, claimed_by="automation:contender"
    )
    assert contender_result is not None
    assert contender_result.account.id == account_id

    # Verify final counter via a fresh session.
    verifier = await make_session()
    assert await _read_counter(verifier, account_id) == 1


async def test_release_returns_slot_to_pool(make_session):
    session = await make_session()
    account_id = await _insert_account(session, max_concurrent=1, current=0)

    service = AccountReservationService(session)
    reservation = await service.reserve(account_id, claimed_by="automation:test")
    assert reservation is not None
    assert await _read_counter(session, account_id) == 1

    # At capacity now — second reserve should fail.
    second = await service.reserve(account_id, claimed_by="automation:test2")
    assert second is None

    # Release returns the slot.
    await service.release(reservation.token)
    assert await _read_counter(session, account_id) == 0

    # Now reservable again.
    third = await service.reserve(account_id, claimed_by="automation:test3")
    assert third is not None


async def test_release_is_idempotent_when_counter_at_zero(make_session):
    """Release is safe to call after partial-failure paths; clamps at 0."""
    session = await make_session()
    account_id = await _insert_account(session, max_concurrent=1, current=0)

    service = AccountReservationService(session)
    reservation = await service.reserve(account_id, claimed_by="automation:test")
    assert reservation is not None

    await service.release(reservation.token)
    # Second release with the same token — no-op, doesn't go negative.
    await service.release(reservation.token)

    assert await _read_counter(session, account_id) == 0


async def test_release_no_op_when_account_missing(make_session):
    """Phase 2d compensation may run after the account row is gone; tolerate it."""
    from datetime import datetime, timezone

    from pixsim7.automation.protocols import ReservationToken

    session = await make_session()
    service = AccountReservationService(session)

    fake_token = ReservationToken(
        account_id=999_999,
        claimed_by="automation:orphan",
        reserved_at=datetime.now(timezone.utc),
        nonce="abc123",
    )
    # Should not raise.
    await service.release(fake_token)


async def test_reserve_with_wait_for_lock_blocks_then_succeeds(make_session):
    """wait_for_lock=True: contender blocks while holder has FOR UPDATE, then
    reserves successfully once the holder commits the released slot back.

    Regression guard for the cross-subsystem same-account case the SKIP LOCKED
    default would handle incorrectly: if A and B both want the same account and
    capacity allows both, B with wait_for_lock=True must wait for A's
    transaction to settle, then succeed.
    """
    setup_session = await make_session()
    account_id = await _insert_account(setup_session, max_concurrent=2, current=0)
    await setup_session.close()

    holder = await make_session()
    contender = await make_session()

    # Holder takes FOR UPDATE on the row but doesn't commit yet.
    await holder.execute(
        text("SELECT id FROM provider_accounts WHERE id = :id FOR UPDATE"),
        {"id": account_id},
    )

    contender_service = AccountReservationService(contender)
    reserve_task = asyncio.create_task(
        contender_service.reserve(
            account_id,
            claimed_by="burner:test",
            wait_for_lock=True,
        )
    )

    # Confirm the contender is actually blocked, not racing past.
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(asyncio.shield(reserve_task), timeout=0.3)
    assert not reserve_task.done()

    # Holder releases the lock — contender should now proceed and succeed.
    await holder.rollback()
    result = await asyncio.wait_for(reserve_task, timeout=2.0)

    assert result is not None
    assert result.account.id == account_id
    assert result.token.claimed_by == "burner:test"

    verifier = await make_session()
    assert await _read_counter(verifier, account_id) == 1


async def test_reserve_with_wait_for_lock_returns_none_when_full(make_session):
    """wait_for_lock=True still respects the capacity gate after acquiring
    the lock — if the row really is full, the lock is released and None
    returned (no false success).
    """
    session = await make_session()
    account_id = await _insert_account(session, max_concurrent=1, current=1)

    service = AccountReservationService(session)
    result = await service.reserve(
        account_id, claimed_by="burner:test", wait_for_lock=True
    )

    assert result is None
    assert await _read_counter(session, account_id) == 1
