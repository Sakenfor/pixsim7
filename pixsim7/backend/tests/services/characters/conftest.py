from typing import AsyncIterator
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.game.core.models import GameLocation, GameNPC, GameWorld
from pixsim7.backend.main.domain.game.entities.character import Character, CharacterUsage
from pixsim7.backend.main.domain.game.entities.character_versioning import CharacterVersionFamily
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_characters_{uuid4().hex}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

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
