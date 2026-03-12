from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.assets.content import ContentBlob
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.domain.game.core.models import GameLocation, GameNPC, GameWorld
from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.domain.game.entities.character_versioning import CharacterVersionFamily
from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.domain.providers.models.account import ProviderAccount
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.services.asset.versioning import AssetVersioningService
from pixsim7.backend.main.services.characters.versioning import CharacterVersioningService
from pixsim7.backend.main.services.prompt.family import PromptFamilyService
from pixsim7.backend.main.services.prompt.git.versioning_adapter import PromptVersioningService
from pixsim7.backend.main.shared.config import settings


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_versioning_contract_{uuid4().hex}"
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception as exc:
                pytest.skip(f"pgvector extension unavailable for integration test: {exc}")

            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET search_path TO "{schema}", public'))
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        User.__table__,
                        ContentBlob.__table__,
                        ProviderAccount.__table__,
                        AssetVersionFamily.__table__,
                        Asset.__table__,
                        GameWorld.__table__,
                        GameLocation.__table__,
                        GameNPC.__table__,
                        CharacterVersionFamily.__table__,
                        Character.__table__,
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


async def _create_user(db_session: AsyncSession, seed: str) -> User:
    user = User(
        email=f"{seed}-{uuid4().hex[:8]}@example.com",
        username=f"{seed}_{uuid4().hex[:8]}",
        password_hash="hash",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_prompt_write_path_contract_root_and_child(db_session: AsyncSession):
    service = PromptFamilyService(db_session)
    family = await service.create_family(
        title="Prompt Contract Family",
        prompt_type="visual",
        slug=f"prompt-contract-{uuid4().hex[:8]}",
    )
    root = await service.create_version(
        family_id=family.id,
        prompt_text="Prompt root",
        commit_message="root",
        author="tester",
    )
    child = await service.create_version(
        family_id=family.id,
        prompt_text="Prompt child",
        commit_message="child",
        author="tester",
        parent_version_id=root.id,
    )

    assert root.family_id == family.id
    assert root.version_number == 1
    assert root.parent_version_id is None
    assert child.family_id == family.id
    assert child.version_number == 2
    assert child.parent_version_id == root.id
    assert child.commit_message == "child"


@pytest.mark.asyncio
async def test_prompt_one_off_write_path_contract(db_session: AsyncSession):
    version = PromptVersion(
        prompt_text="One-off prompt",
        prompt_hash=PromptVersion.compute_hash("One-off prompt"),
    )
    db_session.add(version)

    ctx = await PromptVersioningService(db_session).assign_one_off_metadata(
        new_version=version,
        commit_message="one-off",
    )

    assert version.family_id is None
    assert version.version_number is None
    assert version.parent_version_id is None
    assert version.commit_message == "one-off"
    assert ctx.family_id is None
    assert ctx.version_number is None
    assert ctx.parent_id is None
    assert ctx.version_message == "one-off"


@pytest.mark.asyncio
async def test_asset_write_path_contract_root_upgrade_child_and_head(db_session: AsyncSession):
    user = await _create_user(db_session, "asset_contract")

    parent = await add_asset(
        db_session,
        user_id=user.id,
        media_type=MediaType.IMAGE,
        provider_id="local",
        provider_asset_id=f"asset-parent-{uuid4().hex}",
        remote_url="https://example.com/parent.png",
        width=128,
        height=128,
        mime_type="image/png",
        file_size_bytes=1024,
        sha256="a" * 64,
        stored_key="cas/asset_parent.png",
        local_path="/tmp/asset_parent.png",
        commit=True,
    )
    child = await add_asset(
        db_session,
        user_id=user.id,
        media_type=MediaType.IMAGE,
        provider_id="local",
        provider_asset_id=f"asset-child-{uuid4().hex}",
        remote_url="https://example.com/child.png",
        width=128,
        height=128,
        mime_type="image/png",
        file_size_bytes=1024,
        sha256="b" * 64,
        stored_key="cas/asset_child.png",
        local_path="/tmp/asset_child.png",
        commit=False,
    )

    versioning = AssetVersioningService(db_session)
    await versioning.apply_version_for_upload(
        new_asset_id=child.id,
        parent_asset_id=parent.id,
        version_message="asset child",
    )
    await db_session.commit()
    await db_session.refresh(parent)
    await db_session.refresh(child)

    assert parent.version_family_id is not None
    assert parent.version_number == 1
    assert parent.parent_asset_id is None
    assert child.version_family_id == parent.version_family_id
    assert child.version_number == 2
    assert child.parent_asset_id == parent.id
    assert child.version_message == "asset child"

    family = await versioning.get_family(parent.version_family_id)
    assert family is not None
    assert family.head_asset_id == child.id


@pytest.mark.asyncio
async def test_character_write_path_contract_root_upgrade_child_and_head(db_session: AsyncSession):
    root = Character(
        id=uuid4(),
        character_id=f"char_contract_{uuid4().hex[:8]}",
        name="Hero",
        display_name="Hero",
        category="human",
    )
    db_session.add(root)
    await db_session.commit()
    await db_session.refresh(root)

    versioning = CharacterVersioningService(db_session)
    child = await versioning.evolve(
        root,
        updates={
            "name": "Hero v2",
            "display_name": "Hero v2",
        },
        message="character child",
    )
    await db_session.commit()
    await db_session.refresh(root)
    await db_session.refresh(child)

    assert root.version_family_id is not None
    assert root.version_number == 1
    assert root.parent_character_id is None
    assert child.version_family_id == root.version_family_id
    assert child.version_number == 2
    assert child.parent_character_id == root.id
    assert child.version_message == "character child"

    family = await versioning.get_family(root.version_family_id)
    assert family is not None
    assert family.head_character_id == child.id
