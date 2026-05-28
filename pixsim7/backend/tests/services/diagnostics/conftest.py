"""Fixtures for diagnostics service tests.

``ledger_session`` mirrors the repo's temp-schema pattern (see
``services/links/conftest.py``): an isolated Postgres schema with only the
``backfill_applied`` table created, a savepoint-scoped session, rolled back on
teardown so tests never touch real ledger rows.
"""
from typing import AsyncIterator
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.diagnostics import BackfillApplied
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def ledger_session() -> AsyncIterator[AsyncSession]:
    """Async session in a throwaway schema holding just ``backfill_applied``."""
    schema = f"test_ledger_{uuid4().hex}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn, tables=[BackfillApplied.__table__]
                )
            )
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
