"""End-to-end coverage for /asset-sets CRUD + membership endpoints.

Calls the endpoint functions directly against a REAL AsyncSession on a
throwaway Postgres schema. The ``asset_set`` / ``asset_set_member`` tables FK
into ``users`` / ``assets``; per the FK-bypass convention those two are created
with minimal raw DDL (just the columns these endpoints read) so we don't drag
the whole asset/user domain schema into the fixture.

Verifies:
* create manual (inline members, order preserved) + smart (filters stored,
  no members).
* cross-user asset ids are filtered out of membership (no leaking other
  users' assets into a set).
* visibility: a private set is invisible to other users; flipping
  ``is_shared`` exposes it read-only (non-owner edit -> 403).
* membership add (append/dedupe) / remove / replace-reorder.
* membership ops reject smart sets (400).
* deleting a set cascades its member rows.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "asset-sets-endpoint",
    "label": "Asset Sets CRUD Endpoint Tests",
    "kind": "integration",
    "category": "backend/api",
    "subcategory": "asset-sets",
    "covers": [
        "pixsim7/backend/main/api/v1/asset_sets.py",
        "pixsim7/backend/main/domain/assets/asset_set.py",
    ],
    "order": 27.6,
}

from types import SimpleNamespace
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.api.v1.asset_sets import (
    AssetSetCreateRequest,
    AssetSetMembersRequest,
    AssetSetUpdateRequest,
    add_asset_set_members,
    create_asset_set,
    delete_asset_set,
    get_asset_set,
    list_asset_sets,
    remove_asset_set_members,
    replace_asset_set_members,
    update_asset_set,
)
from pixsim7.backend.main.domain.assets.asset_set import AssetSet, AssetSetMember
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.shared.config import settings


def _user(uid: int) -> SimpleNamespace:
    return SimpleNamespace(id=uid, is_admin=lambda: False)


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_asset_sets_{uuid4().hex}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(
        engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True
    )

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET LOCAL search_path TO "{schema}"'))

            # Minimal FK targets (raw DDL — avoid the full asset/user domain).
            await conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
            await conn.execute(
                text(
                    "CREATE TABLE assets ("
                    "id INTEGER PRIMARY KEY, "
                    "user_id INTEGER NOT NULL)"
                )
            )
            await conn.run_sync(
                lambda sc: SQLModel.metadata.create_all(
                    sc, tables=[AssetSet.__table__, AssetSetMember.__table__]
                )
            )
            # Seed: user 1 owns assets 1-3, user 2 owns asset 4.
            await conn.execute(text("INSERT INTO users (id) VALUES (1), (2)"))
            await conn.execute(
                text(
                    "INSERT INTO assets (id, user_id) VALUES "
                    "(1,1),(2,1),(3,1),(4,2)"
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
async def test_create_manual_preserves_order_and_filters_cross_user(db_session):
    u1 = _user(1)
    # asset 4 belongs to user 2 -> dropped; order of owned ids preserved.
    res = await create_asset_set(
        AssetSetCreateRequest(name="Heroes", kind="manual", asset_ids=[2, 1, 4, 3]),
        u1,
        db_session,
    )
    assert res.kind == "manual"
    assert res.assetIds == [2, 1, 3]
    assert res.memberCount == 3
    assert res.shared is False


@pytest.mark.asyncio
async def test_create_smart_stores_filters_no_members(db_session):
    u1 = _user(1)
    res = await create_asset_set(
        AssetSetCreateRequest(
            name="Recent", kind="smart", filters={"media_type": "video"}, max_results=50
        ),
        u1,
        db_session,
    )
    assert res.kind == "smart"
    assert res.filters == {"media_type": "video"}
    assert res.maxResults == 50
    assert res.assetIds == []


@pytest.mark.asyncio
async def test_visibility_private_then_shared(db_session):
    u1, u2 = _user(1), _user(2)
    created = await create_asset_set(
        AssetSetCreateRequest(name="Private", kind="manual", asset_ids=[1]), u1, db_session
    )

    # u2 cannot see a private set, and cannot fetch it.
    assert (await list_asset_sets(u2, db_session)).sets == []
    with pytest.raises(HTTPException) as exc:
        await get_asset_set(created.id, u2, db_session)
    assert exc.value.status_code == 403

    # Owner shares it -> u2 sees it read-only.
    await update_asset_set(
        created.id, AssetSetUpdateRequest(is_shared=True), u1, db_session
    )
    u2_sets = (await list_asset_sets(u2, db_session)).sets
    assert [s.id for s in u2_sets] == [created.id]
    assert u2_sets[0].shared is True

    # u2 still cannot edit or delete a set it doesn't own.
    with pytest.raises(HTTPException) as exc:
        await update_asset_set(
            created.id, AssetSetUpdateRequest(name="hijack"), u2, db_session
        )
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        await delete_asset_set(created.id, u2, db_session)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_membership_add_remove_replace(db_session):
    u1 = _user(1)
    s = await create_asset_set(
        AssetSetCreateRequest(name="M", kind="manual", asset_ids=[1]), u1, db_session
    )

    # Add appends + dedupes (1 already present) and drops cross-user 4.
    added = await add_asset_set_members(
        s.id, AssetSetMembersRequest(asset_ids=[1, 2, 4, 3]), u1, db_session
    )
    assert added.assetIds == [1, 2, 3]

    # Remove.
    removed = await remove_asset_set_members(
        s.id, AssetSetMembersRequest(asset_ids=[2]), u1, db_session
    )
    assert removed.assetIds == [1, 3]

    # Replace = reorder/bulk set.
    replaced = await replace_asset_set_members(
        s.id, AssetSetMembersRequest(asset_ids=[3, 1, 2]), u1, db_session
    )
    assert replaced.assetIds == [3, 1, 2]


@pytest.mark.asyncio
async def test_membership_ops_reject_smart(db_session):
    u1 = _user(1)
    smart = await create_asset_set(
        AssetSetCreateRequest(name="S", kind="smart", filters={}), u1, db_session
    )
    with pytest.raises(HTTPException) as exc:
        await add_asset_set_members(
            smart.id, AssetSetMembersRequest(asset_ids=[1]), u1, db_session
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_cascades_members(db_session):
    u1 = _user(1)
    s = await create_asset_set(
        AssetSetCreateRequest(name="D", kind="manual", asset_ids=[1, 2]), u1, db_session
    )
    await delete_asset_set(s.id, u1, db_session)

    from sqlalchemy import func, select

    remaining = (
        await db_session.execute(
            select(func.count())
            .select_from(AssetSetMember)
            .where(AssetSetMember.set_id == s.id)
        )
    ).scalar()
    assert remaining == 0
