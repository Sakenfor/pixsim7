"""Test for the per-round quota-rotation cap helper.

The new `_count_submissions_in_current_round` helper is what gates the
rotation loop in job_processor.py — it counts ProviderSubmission rows for a
given generation at the current retry_count snapshot. With cap=3, after 3
rows in the round the worker bails to mark_failed and lets auto_retry
handle the next round (with retry_count++ + escalating defer).

Without this cap, one round could produce N rows for N exhausted accounts.
"""
from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.providers.models.submission import ProviderSubmission
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.workers.job_processor import (
    _count_submissions_in_current_round,
)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_quota_cap_{uuid4().hex[:12]}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(
        engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True
    )

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            # Create a minimal stand-in for provider_submissions without the
            # cross-table FKs (we don't exercise generations / accounts here,
            # just the count query). Mirrors only the columns the helper reads.
            await conn.execute(text("""
                CREATE TABLE provider_submissions (
                    id SERIAL PRIMARY KEY,
                    generation_id INTEGER,
                    generation_attempt_id INTEGER,
                    analysis_id INTEGER,
                    account_id INTEGER NOT NULL,
                    provider_id VARCHAR(50) NOT NULL,
                    payload JSON NOT NULL,
                    response JSON NOT NULL,
                    provider_job_id VARCHAR(200),
                    retry_attempt INTEGER NOT NULL DEFAULT 0,
                    previous_submission_id INTEGER,
                    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    responded_at TIMESTAMP,
                    duration_ms INTEGER,
                    status VARCHAR(20) NOT NULL
                )
            """))
            await conn.execute(text(
                "CREATE INDEX idx_submission_generation_attempt "
                "ON provider_submissions (generation_id, retry_attempt)"
            ))
            session = AsyncSession(
                bind=conn,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
            try:
                yield session
            finally:
                await session.close()
        finally:
            if outer_tx.is_active:
                await outer_tx.rollback()

    await engine.dispose()


def _sub(generation_id: int, retry_attempt: int, status: str = "error") -> ProviderSubmission:
    return ProviderSubmission(
        generation_id=generation_id,
        account_id=1,
        provider_id="pixverse",
        payload={},
        response={},
        retry_attempt=retry_attempt,
        status=status,
    )


@pytest.mark.asyncio
async def test_count_zero_when_no_rows(db_session: AsyncSession):
    assert await _count_submissions_in_current_round(db_session, 1, 0) == 0


@pytest.mark.asyncio
async def test_count_only_matches_current_round(db_session: AsyncSession):
    # 3 rows in round 0 (current), 5 rows in round 1 (later), 1 row in round 0 for a different gen
    for i in range(3):
        db_session.add(_sub(generation_id=42, retry_attempt=0))
    for i in range(5):
        db_session.add(_sub(generation_id=42, retry_attempt=1))
    db_session.add(_sub(generation_id=99, retry_attempt=0))
    await db_session.flush()

    # Round 0 of gen 42 → 3
    assert await _count_submissions_in_current_round(db_session, 42, 0) == 3
    # Round 1 of gen 42 → 5
    assert await _count_submissions_in_current_round(db_session, 42, 1) == 5
    # Round 2 of gen 42 → 0 (no rows yet)
    assert await _count_submissions_in_current_round(db_session, 42, 2) == 0
    # Different gen, isolated
    assert await _count_submissions_in_current_round(db_session, 99, 0) == 1


@pytest.mark.asyncio
async def test_cap_decision_at_boundaries(db_session: AsyncSession):
    """Demonstrate cap=3 boundary: we proceed at 0/1/2, bail at 3+."""
    cap = 3
    # 0 rows → proceed
    assert (await _count_submissions_in_current_round(db_session, 7, 0)) < cap
    # Add row 1
    db_session.add(_sub(generation_id=7, retry_attempt=0))
    await db_session.flush()
    assert (await _count_submissions_in_current_round(db_session, 7, 0)) < cap  # 1 < 3
    # Add row 2
    db_session.add(_sub(generation_id=7, retry_attempt=0))
    await db_session.flush()
    assert (await _count_submissions_in_current_round(db_session, 7, 0)) < cap  # 2 < 3
    # Add row 3 — cap now reached
    db_session.add(_sub(generation_id=7, retry_attempt=0))
    await db_session.flush()
    assert (await _count_submissions_in_current_round(db_session, 7, 0)) >= cap  # 3 >= 3
