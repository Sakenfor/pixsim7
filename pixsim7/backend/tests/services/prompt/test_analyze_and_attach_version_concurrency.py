"""Concurrency test for PromptAnalysisService.analyze_and_attach_version.

Proves the race fix: when N callers hit analyze_and_attach_version with the
same prompt text at the same time, the uq_prompt_versions_hash_family UNIQUE
constraint + IntegrityError retry collapse them onto a single row — all
callers return the same prompt_version_id and exactly one row exists.

Before the fix (no constraint, no retry), batch-of-10 generations could
create N duplicate PromptVersion rows with identical prompt_hash. This test
would fail on that version by finding > 1 row.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Tuple
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text, select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, AsyncEngine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService
from pixsim7.backend.main.shared.config import settings


_CONCURRENCY = 10
_PROMPT_TEXT = "A quiet harbor at dusk with lanterns reflecting on calm water"
_PRECOMPUTED = {
    "prompt": _PROMPT_TEXT,
    "candidates": [],
    "tags": [],
    "source": "composition",
}


@pytest_asyncio.fixture
async def concurrent_schema() -> AsyncIterator[Tuple[AsyncEngine, str]]:
    """Create an isolated schema with PromptVersion table + the UNIQUE constraint.

    Unlike the session-scoped fixture used elsewhere, this yields the engine
    and schema name so tests can open their own independent sessions (required
    for a real concurrent race — sharing one session would serialize).
    """
    schema = f"test_pv_race_{uuid4().hex[:12]}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        # search_path must *exclude* public here — otherwise create_all sees
        # the prod prompt_versions table in public and skips creation in our
        # schema entirely, causing test INSERTs to leak into production.
        await conn.execute(text(f'SET search_path TO "{schema}"'))
        await conn.run_sync(
            lambda sync_conn: SQLModel.metadata.create_all(
                sync_conn,
                tables=[PromptFamily.__table__, PromptVersion.__table__],
            )
        )

    # Per-session search_path — also schema-only so every test query targets
    # our isolated tables (not public).
    @event.listens_for(engine.sync_engine, "connect")
    def _set_search_path(dbapi_conn, _):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute(f'SET search_path TO "{schema}"')
        cur.close()

    try:
        yield engine, schema
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()


async def _call_once(engine: AsyncEngine, family_hint: UUID | None) -> Tuple[UUID, bool]:
    """One analyze_and_attach_version call on its own session."""
    async with AsyncSession(bind=engine, expire_on_commit=False) as session:
        async with session.begin():
            service = PromptAnalysisService(session)
            version, created = await service.analyze_and_attach_version(
                text=_PROMPT_TEXT,
                author="race-tester",
                family_hint=family_hint,
                precomputed_analysis=dict(_PRECOMPUTED),
            )
            return version.id, created


@pytest.mark.asyncio
async def test_concurrent_analyze_and_attach_collapses_to_single_row(
    concurrent_schema: Tuple[AsyncEngine, str],
):
    engine, schema = concurrent_schema

    # Precondition: the UNIQUE constraint must actually exist in the test schema,
    # otherwise the test is validating nothing.
    async with AsyncSession(bind=engine) as verify:
        constraint_rows = (
            await verify.execute(
                text("""
                    SELECT conname, pg_get_constraintdef(c.oid) AS defn
                    FROM pg_constraint c
                    JOIN pg_class t ON t.oid = c.conrelid
                    JOIN pg_namespace n ON n.oid = t.relnamespace
                    WHERE n.nspname = :schema
                      AND t.relname = 'prompt_versions'
                      AND c.contype = 'u'
                """),
                {"schema": schema},
            )
        ).all()
    assert any(
        r.conname == "uq_prompt_versions_hash_family" for r in constraint_rows
    ), f"uq_prompt_versions_hash_family missing in test schema: {constraint_rows}"

    results = await asyncio.gather(
        *[_call_once(engine, family_hint=None) for _ in range(_CONCURRENCY)]
    )

    ids = {vid for vid, _ in results}
    created_flags = [created for _, created in results]

    assert len(ids) == 1, (
        f"Expected all {_CONCURRENCY} callers to return the same PromptVersion id, "
        f"got {len(ids)} distinct ids: {ids}"
    )
    assert sum(created_flags) == 1, (
        f"Expected exactly 1 caller to report created=True, got {sum(created_flags)}"
    )

    async with AsyncSession(bind=engine) as verify_session:
        row_count = (
            await verify_session.execute(
                select(func.count()).select_from(PromptVersion)
            )
        ).scalar_one()
    assert row_count == 1, (
        f"Expected 1 PromptVersion row after concurrent insert, got {row_count}"
    )
