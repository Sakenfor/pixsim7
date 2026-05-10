"""
Per-test schema isolation for AccountReservationService tests.

Uses raw DDL for `provider_accounts` (no FK to users.id) per the
test-fixture-fk-bypass canon — provider_accounts FKs into another domain that
isn't loaded for these narrow service tests.

Two fixtures are provided:
  - `schema`: the temporary schema name (creator/owner of the table). The
    underlying schema is dropped at teardown.
  - `make_session`: factory returning fresh AsyncSession objects on independent
    connections, all pinned to `schema`. Required for the concurrent-claim
    test — savepoint-based fixtures share one connection and can't exercise
    real SELECT FOR UPDATE SKIP LOCKED behavior.
"""
from __future__ import annotations

from typing import AsyncIterator, Awaitable, Callable
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings


_PROVIDER_CREDITS_DDL = """
CREATE TABLE provider_credits (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    credit_type VARCHAR NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
)
"""


_ACCOUNT_STATUS_ENUM_DDL = """
CREATE TYPE accountstatus AS ENUM (
    'ACTIVE',
    'EXHAUSTED',
    'ERROR',
    'DISABLED',
    'RATE_LIMITED'
)
"""


_PROVIDER_ACCOUNTS_DDL = """
CREATE TABLE provider_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NULL,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    provider_id VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR NULL,
    jwt_token VARCHAR NULL,
    api_key VARCHAR NULL,
    api_keys JSON NULL,
    cookies JSON NULL,
    nickname VARCHAR(100) NULL,
    provider_user_id VARCHAR(100) NULL,
    provider_metadata JSON NULL,
    total_videos_generated INTEGER NOT NULL DEFAULT 0,
    total_videos_failed INTEGER NOT NULL DEFAULT 0,
    failure_streak INTEGER NOT NULL DEFAULT 0,
    status accountstatus NOT NULL DEFAULT 'ACTIVE',
    last_error VARCHAR NULL,
    last_used TIMESTAMP NULL,
    cooldown_until TIMESTAMP NULL,
    success_rate FLOAT NOT NULL DEFAULT 1.0,
    avg_generation_time_sec FLOAT NULL,
    ema_generation_time_sec FLOAT NULL,
    ema_alpha FLOAT NOT NULL DEFAULT 0.3,
    max_concurrent_jobs INTEGER NOT NULL DEFAULT 2,
    current_processing_jobs INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    routing_allow_patterns JSON NULL,
    routing_deny_patterns JSON NULL,
    routing_priority_overrides JSON NULL,
    max_daily_videos INTEGER NULL,
    videos_today INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
)
"""


def _make_engine(*, search_path: str | None = None) -> AsyncEngine:
    """Create an async engine. When `search_path` is given, every new
    connection (NullPool issues a new one per checkout) inherits that schema
    via asyncpg's server_settings — without this, SET search_path is lost
    between transactions and the next query falls back to `public`.
    """
    connect_args: dict = {}
    if search_path is not None:
        connect_args["server_settings"] = {"search_path": search_path}
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
        connect_args=connect_args,
    )
    event.listen(
        engine.sync_engine,
        "before_cursor_execute",
        _strip_tz_from_params,
        retval=True,
    )
    return engine


@pytest_asyncio.fixture
async def schema() -> AsyncIterator[str]:
    """Create an isolated schema with a `provider_accounts` table; drop on teardown."""
    schema_name = f"test_acct_resv_{uuid4().hex}"
    admin_engine = _make_engine()
    try:
        async with admin_engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            await conn.execute(text(f'SET LOCAL search_path TO "{schema_name}"'))
            await conn.execute(text(_ACCOUNT_STATUS_ENUM_DDL))
            await conn.execute(text(_PROVIDER_ACCOUNTS_DDL))
            await conn.execute(text(_PROVIDER_CREDITS_DDL))

        yield schema_name

        async with admin_engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
    finally:
        await admin_engine.dispose()


SessionFactory = Callable[[], Awaitable[AsyncSession]]


@pytest_asyncio.fixture
async def make_session(schema: str) -> AsyncIterator[SessionFactory]:
    """Factory yielding independent sessions, each on its own connection.

    Concurrent-claim tests need true cross-connection contention — savepoint
    sessions on one connection don't honor SKIP LOCKED across "callers".
    """
    engines: list[AsyncEngine] = []
    sessions: list[AsyncSession] = []

    async def _factory() -> AsyncSession:
        engine = _make_engine(search_path=schema)
        engines.append(engine)
        session = AsyncSession(engine, expire_on_commit=False)
        sessions.append(session)
        return session

    try:
        yield _factory
    finally:
        for s in sessions:
            await s.close()
        for e in engines:
            await e.dispose()
