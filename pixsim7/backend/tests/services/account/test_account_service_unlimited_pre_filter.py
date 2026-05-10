"""
Pin: ``select_and_reserve_account`` must prefer an account where the chosen
model is unlimited *even when* the account would otherwise be excluded by the
SQL credit pre-filter.

The unlimited tier added in commit ``facf1c1e2`` ranks survivors of
``_rank_candidates``. But the SQL pre-filter at ``account_service.py:798-813``
runs first: it requires ``ProviderCredit.amount >= min_credits`` for the
account to even appear in the candidate scan. An unlimited account with low
or zero stored credits (the normal state when the model doesn't consume
credits) silently fails that gate, so the ranker never sees it and the
higher-priority paid account wins.

The fallback at ``account_service.py:957`` (re-scan without credit filter)
only fires when the pre-filter excludes *everyone* — so as soon as one paid
account survives, the unlimited account is unreachable.

This test uses the real Postgres-backed ``provider_accounts`` /
``provider_credits`` tables (per account-tests conftest) so the actual SQL
filter runs.
"""
from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.account.account_service import AccountService


pytestmark = pytest.mark.asyncio


async def _insert_account(
    session: AsyncSession,
    *,
    email: str,
    priority: int,
    provider_id: str = "pixverse",
    metadata: dict | None = None,
) -> int:
    """Insert one provider_accounts row, returning its id."""
    import json

    result = await session.execute(
        text(
            """
            INSERT INTO provider_accounts
                (email, provider_id, status, max_concurrent_jobs,
                 current_processing_jobs, priority, provider_metadata)
            VALUES (:email, :provider_id, 'ACTIVE', 2, 0, :priority,
                    CAST(:metadata AS json))
            RETURNING id
            """
        ),
        {
            "email": email,
            "provider_id": provider_id,
            "priority": priority,
            "metadata": json.dumps(metadata) if metadata is not None else None,
        },
    )
    account_id = result.scalar_one()
    await session.commit()
    return account_id


async def _insert_credit(
    session: AsyncSession,
    *,
    account_id: int,
    credit_type: str,
    amount: int,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO provider_credits (account_id, credit_type, amount)
            VALUES (:account_id, :credit_type, :amount)
            """
        ),
        {"account_id": account_id, "credit_type": credit_type, "amount": amount},
    )
    await session.commit()


async def test_unlimited_account_wins_when_paid_passes_credit_prefilter(make_session):
    """Bug repro: paid account passes the SQL ``amount >= min_credits``
    pre-filter while the unlimited account fails it (its stored credits are
    below the model's normal cost). The new unlimited tier should still pick
    the unlimited account because the model is in its plan-unlimited list.

    Setup mirrors the production case the user reported:
      - account 1 (paid, priority 99): 9000 credits → passes pre-filter.
      - account 2 (unlimited for ``seedream-4.0``, priority 0): 0 credits
        → fails the SQL pre-filter, never enters the ranker.

    Without the fix, account 1 wins because it's the only candidate the
    ranker ever sees. With the fix, account 2 wins because the unlimited
    bypass keeps it in the candidate set despite the credit shortfall.
    """
    session = await make_session()

    paid_id = await _insert_account(session, email="paid@test", priority=99)
    unlimited_id = await _insert_account(
        session,
        email="unlimited@test",
        priority=0,
        metadata={"unlimited_image_models": ["seedream-4.0"]},
    )

    # Paid account has plenty of credits, unlimited has none.
    await _insert_credit(session, account_id=paid_id, credit_type="image", amount=9000)
    await _insert_credit(session, account_id=unlimited_id, credit_type="image", amount=0)

    service = AccountService(db=session)
    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type="text_to_image",
        model="seedream-4.0",
        min_credits=10,
    )

    assert selected.id == unlimited_id, (
        f"expected unlimited account ({unlimited_id}) to win, "
        f"got paid account ({selected.id})"
    )


async def test_unlimited_bypass_matches_model_via_alias_normalization(make_session):
    """Operator shorthand (``seedream-4``) should match a stored canonical
    entry (``seedream-4.0``) at the SQL pre-filter level. Without alias
    expansion the LIKE pattern would only test the literal request token.
    """
    session = await make_session()

    paid_id = await _insert_account(session, email="paid@test", priority=99)
    unlimited_id = await _insert_account(
        session,
        email="unlimited@test",
        priority=0,
        # Stored as canonical, but request comes in as shorthand.
        metadata={"unlimited_image_models": ["seedream-4.0"]},
    )

    await _insert_credit(session, account_id=paid_id, credit_type="image", amount=9000)
    await _insert_credit(session, account_id=unlimited_id, credit_type="image", amount=0)

    service = AccountService(db=session)
    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type="text_to_image",
        model="seedream-4",  # shorthand — alias map: seedream-4 -> seedream-4.0
        min_credits=10,
    )

    assert selected.id == unlimited_id


async def test_unlimited_bypass_uses_legacy_metadata_key(make_session):
    """``plan_unlimited_image_models`` is the older key PixVerse syncs (see
    ``pixverse_credits.py:675``); both must be honored by the SQL bypass
    just as the Python ``_account_has_unlimited_model`` does."""
    session = await make_session()

    paid_id = await _insert_account(session, email="paid@test", priority=99)
    unlimited_id = await _insert_account(
        session,
        email="unlimited@test",
        priority=0,
        metadata={"plan_unlimited_image_models": ["qwen-image"]},
    )

    await _insert_credit(session, account_id=paid_id, credit_type="image", amount=9000)
    await _insert_credit(session, account_id=unlimited_id, credit_type="image", amount=0)

    service = AccountService(db=session)
    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type="text_to_image",
        model="qwen-image",
        min_credits=10,
    )

    assert selected.id == unlimited_id


async def test_select_account_probe_bypasses_credit_gate_for_unlimited(make_session):
    """The fail-fast probe (``select_account``) had the same bug in Python
    form: ``has_sufficient_credits`` would drop the unlimited account
    before the unlimited tier sort could rank it, so the UI cost preview
    showed the paid account.
    """
    session = await make_session()

    paid_id = await _insert_account(session, email="paid@test", priority=99)
    unlimited_id = await _insert_account(
        session,
        email="unlimited@test",
        priority=0,
        metadata={"unlimited_image_models": ["seedream-4.0"]},
    )

    await _insert_credit(session, account_id=paid_id, credit_type="image", amount=9000)
    await _insert_credit(session, account_id=unlimited_id, credit_type="image", amount=0)

    service = AccountService(db=session)
    selected = await service.select_account(
        provider_id="pixverse",
        operation_type="text_to_image",
        model="seedream-4.0",
        required_credits=10,
    )

    assert selected.id == unlimited_id
