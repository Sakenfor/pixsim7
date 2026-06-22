"""Concurrency test for PromptAnalysisService.analyze_and_attach_version.

Proves the race fix: when N callers hit analyze_and_attach_version with the
same prompt text at the same time, the uq_prompt_versions_hash_family UNIQUE
constraint + IntegrityError retry collapse them onto a single row — all
callers return the same prompt_version_id and exactly one row exists.

Before the fix (no constraint, no retry), batch-of-10 generations could
create N duplicate PromptVersion rows with identical prompt_hash. This test
would fail on that version by finding > 1 row.

Second test (added May 2026): proves the *work-coalescing* fix on top of the
row-collision fix. The original implementation prevented duplicate ROWS but
still let N callers each run the (1-2 second) analyzer in parallel before
racing on INSERT. Adding a hash-keyed `pg_advisory_xact_lock` before the
analyzer call makes followers wait for the leader's COMMIT, then short-circuit
on the re-check — so the analyzer runs exactly once across the whole burst.
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Dict, Tuple
from unittest.mock import patch
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


# ---------------------------------------------------------------------------
# Work-coalescing test (added May 2026, regression for prompt-burst latency)
# ---------------------------------------------------------------------------


async def _call_with_real_analyzer_path(
    engine: AsyncEngine, family_hint: UUID | None
) -> Tuple[UUID, bool]:
    """One analyze_and_attach_version call WITHOUT precomputed_analysis.

    This forces the analyzer-call branch — exactly what production POST
    /api/v1/generations does for first-time prompts. The mocked analyze()
    in the test counts how many times it's invoked across N siblings.
    """
    async with AsyncSession(bind=engine, expire_on_commit=False) as session:
        async with session.begin():
            service = PromptAnalysisService(session)
            version, created = await service.analyze_and_attach_version(
                text=_PROMPT_TEXT,
                analyzer_id="prompt:simple",
                author="coalesce-tester",
                family_hint=family_hint,
                # NO precomputed_analysis → forces self.analyze() to run
            )
            return version.id, created


@pytest.mark.asyncio
async def test_concurrent_analyze_and_attach_runs_analyzer_only_once(
    concurrent_schema: Tuple[AsyncEngine, str],
):
    """The analyzer must run exactly ONCE across N concurrent identical creates.

    The advisory lock added to ``_acquire_lock_and_recheck`` should make
    followers block until the leader commits, then short-circuit via the
    in-lock re-check. Without the lock, all N callers would each run
    ``analyze()`` (1-2s of CPU + DB work in production) before racing on
    INSERT — that's the wasted work the IntegrityError fallback couldn't
    prevent and the symptom that caused the user-visible 8-12 second
    burst latency.
    """
    engine, _ = concurrent_schema

    analyzer_calls = 0
    analyzer_lock = asyncio.Lock()

    async def _counting_analyze(self: PromptAnalysisService, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        nonlocal analyzer_calls
        async with analyzer_lock:
            analyzer_calls += 1
        # Simulate a slow real analyzer (~1s). This is what makes the
        # un-coalesced version observably bad — N callers each pay this.
        await asyncio.sleep(0.5)
        return {
            "prompt": _PROMPT_TEXT,
            "candidates": [],
            "tags": [],
            "analyzer_id": "prompt:simple",
            "provenance": {},
        }

    with patch.object(PromptAnalysisService, "analyze", _counting_analyze):
        results = await asyncio.gather(
            *[_call_with_real_analyzer_path(engine, family_hint=None) for _ in range(_CONCURRENCY)]
        )

    ids = {vid for vid, _ in results}
    created_flags = [created for _, created in results]

    # Correctness: same row, exactly one creator
    assert len(ids) == 1, (
        f"Expected all {_CONCURRENCY} callers to return the same id, got {ids}"
    )
    assert sum(created_flags) == 1, (
        f"Expected exactly 1 caller to report created=True, got {sum(created_flags)}"
    )

    # The actual coalescing assertion
    assert analyzer_calls == 1, (
        f"Expected exactly 1 analyzer call across {_CONCURRENCY} concurrent "
        f"identical creates (advisory lock should coalesce them), but "
        f"analyze() was called {analyzer_calls} times. This means followers "
        f"are running the analyzer instead of waiting for the leader and "
        f"short-circuiting on the re-check inside the lock. Check "
        f"PromptAnalysisService._acquire_lock_and_recheck and the call "
        f"site in analyze_and_attach_version."
    )

    # Sanity: still only one row in the DB
    async with AsyncSession(bind=engine) as verify_session:
        row_count = (
            await verify_session.execute(
                select(func.count()).select_from(PromptVersion)
            )
        ).scalar_one()
    assert row_count == 1


@pytest.mark.asyncio
async def test_concurrent_distinct_prompts_run_in_parallel(
    concurrent_schema: Tuple[AsyncEngine, str],
):
    """Different prompts must NOT serialize on the advisory lock.

    Per-prompt-hash granularity: two creates with different prompt text
    (different hashes → different lock keys) should run their analyzer
    calls in parallel, not back-to-back.
    """
    engine, _ = concurrent_schema

    # Two distinct prompts → distinct hashes → distinct lock keys
    prompt_a = "First unique prompt for parallel test"
    prompt_b = "Second unique prompt for parallel test"

    started_at: Dict[str, float] = {}

    async def _slow_analyze(self: PromptAnalysisService, text_arg: str, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        started_at[text_arg.strip()] = loop.time()
        await asyncio.sleep(0.5)
        return {
            "prompt": text_arg,
            "candidates": [],
            "tags": [],
            "analyzer_id": "prompt:simple",
            "provenance": {},
        }

    async def _call(prompt_text: str) -> UUID:
        async with AsyncSession(bind=engine, expire_on_commit=False) as session:
            async with session.begin():
                service = PromptAnalysisService(session)
                version, _ = await service.analyze_and_attach_version(
                    text=prompt_text,
                    analyzer_id="prompt:simple",
                    author="parallel-tester",
                )
                return version.id

    with patch.object(PromptAnalysisService, "analyze", _slow_analyze):
        await asyncio.gather(_call(prompt_a), _call(prompt_b))

    # Both analyzers should have started within a short window of each
    # other — if the lock were global instead of per-hash, the second
    # one would start ~500ms after the first.
    assert prompt_a in started_at and prompt_b in started_at
    delta_ms = abs(started_at[prompt_a] - started_at[prompt_b]) * 1000
    assert delta_ms < 100, (
        f"Distinct prompts should analyze in parallel — start delta was "
        f"{delta_ms:.1f}ms (>100ms threshold). The advisory lock may be "
        f"using a too-coarse key, serializing unrelated prompts."
    )
