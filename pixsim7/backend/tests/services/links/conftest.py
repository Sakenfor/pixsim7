from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.game.core.models import GameLocation, GameNPC, GameWorld
from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
from pixsim7.backend.main.domain.links import ObjectLink
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.services.links.default_mappings import register_default_mappings
from pixsim7.backend.main.services.links.entity_loaders import (
    get_entity_loader_registry,
    register_default_loaders,
)
from pixsim7.backend.main.services.links.link_types import (
    get_link_type_registry,
    register_default_link_types,
)
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry


@pytest.fixture(autouse=True)
def _reset_link_registries() -> None:
    """Ensure deterministic link registry state for each links test."""
    link_types = get_link_type_registry()
    loaders = get_entity_loader_registry()
    mappings = get_mapping_registry()

    link_types.clear()
    loaders.clear()
    mappings.clear()

    register_default_link_types()
    register_default_loaders()
    register_default_mappings()


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Provide an async DB session isolated in a temporary Postgres schema."""
    schema = f"test_links_{uuid4().hex}"
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
                        Character.__table__,
                        GameWorld.__table__,
                        GameLocation.__table__,
                        GameNPC.__table__,
                        CharacterInstance.__table__,
                        ObjectLink.__table__,
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
