from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService
from pixsim7.backend.main.services.prompt.family import PromptFamilyService
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_prompt_family_{uuid4().hex}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET search_path TO "{schema}", public'))

            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        PromptFamily.__table__,
                        PromptVersion.__table__,
                    ],
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


@pytest.mark.asyncio
async def test_create_version_assigns_root_and_child_metadata_via_shared_base(db_session: AsyncSession):
    service = PromptFamilyService(db_session)
    family = await service.create_family(
        title="Bench scene",
        prompt_type="visual",
        slug="bench-scene",
    )

    v1 = await service.create_version(
        family_id=family.id,
        prompt_text="A cozy bench scene at dusk",
        commit_message="Initial draft",
        author="tester",
    )
    v2 = await service.create_version(
        family_id=family.id,
        prompt_text="A cozy bench scene at dusk with warmer lighting",
        commit_message="Adjust lighting",
        author="tester",
        parent_version_id=v1.id,
    )

    assert v1.family_id == family.id
    assert v1.version_number == 1
    assert v1.parent_version_id is None
    assert v1.commit_message == "Initial draft"

    assert v2.family_id == family.id
    assert v2.version_number == 2
    assert v2.parent_version_id == v1.id
    assert v2.commit_message == "Adjust lighting"
    assert v2.diff_from_parent


@pytest.mark.asyncio
async def test_create_version_rejects_parent_from_different_family(db_session: AsyncSession):
    service = PromptFamilyService(db_session)
    family_a = await service.create_family(
        title="Family A",
        prompt_type="visual",
        slug="family-a",
    )
    family_b = await service.create_family(
        title="Family B",
        prompt_type="visual",
        slug="family-b",
    )

    parent_in_b = await service.create_version(
        family_id=family_b.id,
        prompt_text="Family B root prompt",
        commit_message="B root",
        author="tester",
    )

    with pytest.raises(ValueError, match="does not belong to family"):
        await service.create_version(
            family_id=family_a.id,
            prompt_text="Attempt invalid parent linkage",
            commit_message="Invalid link",
            author="tester",
            parent_version_id=parent_in_b.id,
        )


@pytest.mark.asyncio
async def test_analyze_and_attach_version_uses_shared_family_version_allocator(db_session: AsyncSession):
    family_service = PromptFamilyService(db_session)
    family = await family_service.create_family(
        title="Family from analysis",
        prompt_type="visual",
        slug="family-from-analysis",
    )
    analysis_service = PromptAnalysisService(db_session)

    v1, created1 = await analysis_service.analyze_and_attach_version(
        text="A neon alley at night",
        family_hint=family.id,
        author="tester",
        precomputed_analysis={
            "prompt": "A neon alley at night",
            "candidates": [],
            "tags": [],
            "source": "composition",
        },
    )
    v2, created2 = await analysis_service.analyze_and_attach_version(
        text="A neon alley at night with rain reflections",
        family_hint=family.id,
        author="tester",
        precomputed_analysis={
            "prompt": "A neon alley at night with rain reflections",
            "candidates": [],
            "tags": [],
            "source": "composition",
        },
    )

    assert created1 is True
    assert created2 is True
    assert v1.family_id == family.id
    assert v1.version_number == 1
    assert v1.parent_version_id is None
    assert v2.family_id == family.id
    assert v2.version_number == 2
    assert v2.parent_version_id is None


@pytest.mark.asyncio
async def test_create_version_drops_legacy_prompt_analysis_from_provider_hints(db_session: AsyncSession):
    service = PromptFamilyService(db_session)
    family = await service.create_family(
        title="Legacy hints cleanup",
        prompt_type="visual",
        slug=f"legacy-hints-{uuid4().hex[:8]}",
    )
    legacy_analysis = {"prompt": "A studio portrait", "candidates": [], "tags": []}

    version = await service.create_version(
        family_id=family.id,
        prompt_text="A studio portrait",
        commit_message="legacy import",
        provider_hints={"prompt_analysis": legacy_analysis, "source": "legacy-import"},
        author="tester",
    )

    assert version.prompt_analysis is None
    assert version.provider_hints == {"source": "legacy-import"}


@pytest.mark.asyncio
async def test_create_version_prefers_explicit_prompt_analysis_over_legacy_hint(db_session: AsyncSession):
    service = PromptFamilyService(db_session)
    family = await service.create_family(
        title="Prompt analysis precedence",
        prompt_type="visual",
        slug=f"analysis-precedence-{uuid4().hex[:8]}",
    )
    explicit_analysis = {"prompt": "Explicit", "candidates": [{"id": "x"}], "tags": ["a"]}
    legacy_analysis = {"prompt": "Legacy", "candidates": [], "tags": []}

    version = await service.create_version(
        family_id=family.id,
        prompt_text="Explicit",
        commit_message="explicit wins",
        provider_hints={"prompt_analysis": legacy_analysis, "source": "manual"},
        prompt_analysis=explicit_analysis,
        author="tester",
    )

    assert version.prompt_analysis == explicit_analysis
    assert version.provider_hints == {"source": "manual"}
