"""Test for GenerationCreationService._track_character_refs_for_generation.

Proves plan B of the CharacterUsage wiring:
    - {{character:id}} tokens in final_prompt are extracted
    - CharacterUsage rows are written for each referenced character,
      with prompt_version_id populated (the FK we just promoted)
    - generation.canonical_params["character_refs"] is populated
"""
from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.game.core.models import GameLocation, GameNPC, GameWorld
from pixsim7.backend.main.domain.game.entities.character import Character, CharacterUsage
from pixsim7.backend.main.domain.game.entities.character_versioning import (
    CharacterVersionFamily,
)
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.enums import (
    OperationType,
    GenerationStatus,
    BillingState,
)
from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.generation.creation import GenerationCreationService
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_char_ref_wire_{uuid4().hex[:12]}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(
        engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True
    )

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        GameWorld.__table__,
                        GameLocation.__table__,
                        GameNPC.__table__,
                        PromptFamily.__table__,
                        PromptVersion.__table__,
                        CharacterVersionFamily.__table__,
                        Character.__table__,
                        CharacterUsage.__table__,
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
async def test_track_character_refs_writes_usage_and_canonical_params(
    db_session: AsyncSession,
):
    prompt_version = PromptVersion(
        prompt_text="Hello {{character:gorilla_01}} world",
        prompt_hash=PromptVersion.compute_hash("Hello {{character:gorilla_01}} world"),
        prompt_analysis=None,
        author="tester",
    )
    db_session.add(prompt_version)

    character = Character(
        character_id="gorilla_01",
        name="Koba",
        display_name="Koba the Gorilla",
        category="creature",
    )
    db_session.add(character)
    await db_session.flush()

    # Build an in-memory Generation — we don't insert it (no user/provider
    # infra in the test schema), we just hand it to the tracking method.
    # The method reads final_prompt/prompt_version_id/id and mutates
    # canonical_params; it never re-fetches the row.
    generation = Generation(
        id=424242,
        user_id=1,
        operation_type=OperationType.IMAGE_TO_VIDEO,
        provider_id="stub",
        canonical_params={"seed": 7},
        inputs={},
        final_prompt=prompt_version.prompt_text,
        prompt_version_id=prompt_version.id,
        reproducible_hash="x" * 64,
        status=GenerationStatus.PENDING,
        billing_state=BillingState.PENDING,
    )

    service = GenerationCreationService(db_session, user_service=None)
    await service._track_character_refs_for_generation(generation)

    rows = (
        await db_session.execute(
            select(CharacterUsage).where(CharacterUsage.character_id == character.id)
        )
    ).scalars().all()

    usage_types = sorted(r.usage_type for r in rows)
    assert usage_types == ["generation", "prompt"], (
        f"expected both usage_type='prompt' and 'generation' rows, got {usage_types}"
    )
    for row in rows:
        assert row.prompt_version_id == prompt_version.id, (
            f"row {row.id} ({row.usage_type}) missing prompt_version_id: "
            f"{row.prompt_version_id}"
        )

    refs = (generation.canonical_params or {}).get("character_refs")
    assert refs == [f"character:{character.id}"], (
        f"canonical_params.character_refs wrong: {refs}"
    )


@pytest.mark.asyncio
async def test_track_character_refs_no_op_on_empty_prompt(db_session: AsyncSession):
    generation = Generation(
        id=1,
        user_id=1,
        operation_type=OperationType.IMAGE_TO_VIDEO,
        provider_id="stub",
        canonical_params={},
        inputs={},
        final_prompt=None,
        reproducible_hash="y" * 64,
        status=GenerationStatus.PENDING,
        billing_state=BillingState.PENDING,
    )
    service = GenerationCreationService(db_session, user_service=None)
    await service._track_character_refs_for_generation(generation)

    row_count = (
        await db_session.execute(select(CharacterUsage))
    ).scalars().all()
    assert row_count == []


@pytest.mark.asyncio
async def test_track_character_refs_no_op_when_no_tokens(db_session: AsyncSession):
    generation = Generation(
        id=2,
        user_id=1,
        operation_type=OperationType.IMAGE_TO_VIDEO,
        provider_id="stub",
        canonical_params={},
        inputs={},
        final_prompt="A plain prompt with no character tokens at all.",
        reproducible_hash="z" * 64,
        status=GenerationStatus.PENDING,
        billing_state=BillingState.PENDING,
    )
    service = GenerationCreationService(db_session, user_service=None)
    await service._track_character_refs_for_generation(generation)

    row_count = (
        await db_session.execute(select(CharacterUsage))
    ).scalars().all()
    assert row_count == []
    assert "character_refs" not in (generation.canonical_params or {})
