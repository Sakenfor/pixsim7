"""
MultiVectorTableStorage tests — real Postgres + pgvector.

pgvector cosine ordering and INSERT…ON CONFLICT upsert are the entire point
of this storage flavour, so they can't be faked. We stand up an isolated
schema with two throwaway tables (entity + companion vector table) on their
own DeclarativeBase — no global SQLModel metadata, no FK into other domains
(the FK-bypass spirit from the test-fixture convention). Skips cleanly if
the pgvector extension isn't available.
"""
from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import NullPool

from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.embedding.storage import (
    MultiVectorTable,
    MultiVectorTableStorage,
    StoredEmbedding,
)
from pixsim7.backend.main.shared.config import settings

pytestmark = pytest.mark.asyncio


class _Base(DeclarativeBase):
    pass


class _Doc(_Base):
    __tablename__ = "mv_doc"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column()


class _DocEmbedding(_Base):
    __tablename__ = "mv_doc_embedding"
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("mv_doc.id"), primary_key=True
    )
    embedder_id: Mapped[str] = mapped_column(primary_key=True)
    vector = mapped_column(Vector(4), nullable=False)
    model_id: Mapped[str | None] = mapped_column(nullable=True)


def _table() -> MultiVectorTable:
    return MultiVectorTable(
        entity_model=_Doc,
        vector_model=_DocEmbedding,
        entity_pk=_Doc.id,
        entity_fk=_DocEmbedding.doc_id,
        embedder_id_column=_DocEmbedding.embedder_id,
        vector_column=_DocEmbedding.vector,
        model_id_column=_DocEmbedding.model_id,
    )


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_mv_storage_{uuid4().hex}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(
        engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True
    )

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception as exc:
                pytest.skip(f"pgvector extension unavailable: {exc}")

            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET search_path TO "{schema}", public'))
            await conn.run_sync(
                lambda sync_conn: _Base.metadata.create_all(
                    sync_conn, tables=[_Doc.__table__, _DocEmbedding.__table__]
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


async def _add_doc(db: AsyncSession, title: str) -> _Doc:
    doc = _Doc(title=title)
    db.add(doc)
    await db.flush()
    return doc


async def test_upsert_then_get_existing_roundtrip(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    doc = await _add_doc(db_session, "alpha")

    assert await storage.get_existing(doc, embedder_id="siglip") is None

    await storage.upsert(
        doc, embedder_id="siglip", vector=[1.0, 0.0, 0.0, 0.0], model_id="m1"
    )
    got = await storage.get_existing(doc, embedder_id="siglip")
    assert isinstance(got, StoredEmbedding)
    assert got.vector == [1.0, 0.0, 0.0, 0.0]
    assert got.model_id == "m1"
    assert got.embedder_id == "siglip"


async def test_upsert_replaces_on_conflict(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    doc = await _add_doc(db_session, "alpha")

    await storage.upsert(doc, embedder_id="siglip", vector=[1, 0, 0, 0], model_id="m1")
    await storage.upsert(doc, embedder_id="siglip", vector=[0, 1, 0, 0], model_id="m2")

    got = await storage.get_existing(doc, embedder_id="siglip")
    assert got is not None
    assert got.vector == [0.0, 1.0, 0.0, 0.0]
    assert got.model_id == "m2"


async def test_distinct_embedder_ids_coexist(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    doc = await _add_doc(db_session, "alpha")

    await storage.upsert(doc, embedder_id="siglip", vector=[1, 0, 0, 0], model_id="a")
    await storage.upsert(doc, embedder_id="fashion", vector=[0, 1, 0, 0], model_id="b")

    siglip = await storage.get_existing(doc, embedder_id="siglip")
    fashion = await storage.get_existing(doc, embedder_id="fashion")
    assert siglip is not None and siglip.vector == [1.0, 0.0, 0.0, 0.0]
    assert fashion is not None and fashion.vector == [0.0, 1.0, 0.0, 0.0]


async def test_similarity_orders_by_cosine_and_excludes_source(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    query = await _add_doc(db_session, "query")
    near = await _add_doc(db_session, "near")
    far = await _add_doc(db_session, "far")

    # query vector points along x; near is mostly-x, far is mostly-y.
    await storage.upsert(query, embedder_id="e", vector=[1, 0, 0, 0], model_id="m")
    await storage.upsert(near, embedder_id="e", vector=[0.9, 0.1, 0, 0], model_id="m")
    await storage.upsert(far, embedder_id="e", vector=[0.1, 0.9, 0, 0], model_id="m")
    await db_session.flush()

    stmt = storage.build_similarity_select(
        query_vector=[1.0, 0.0, 0.0, 0.0],
        embedder_id="e",
        embedding_model="m",
        exclude_entity=query,
        limit=10,
    )
    rows = (await db_session.execute(stmt)).all()
    returned = [(row[0].title, float(row[1])) for row in rows]

    titles = [t for t, _ in returned]
    assert "query" not in titles  # source excluded
    assert titles == ["near", "far"]  # near is closer (smaller cosine distance)
    assert returned[0][1] < returned[1][1]


async def test_unembedded_select_finds_only_missing(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    embedded = await _add_doc(db_session, "has-vec")
    await _add_doc(db_session, "no-vec")
    await storage.upsert(embedded, embedder_id="e", vector=[1, 0, 0, 0], model_id="m")
    await db_session.flush()

    stmt = storage.build_unembedded_select(embedder_id="e", model_id="m", force=False)
    docs = (await db_session.execute(stmt)).scalars().unique().all()
    titles = {d.title for d in docs}

    assert "no-vec" in titles
    assert "has-vec" not in titles


async def test_unembedded_select_stale_model_included(db_session: AsyncSession):
    storage = MultiVectorTableStorage(db=db_session, table=_table())
    doc = await _add_doc(db_session, "stale")
    await storage.upsert(doc, embedder_id="e", vector=[1, 0, 0, 0], model_id="old")
    await db_session.flush()

    # Asking for a different model_id => the existing row is stale => included.
    stmt = storage.build_unembedded_select(embedder_id="e", model_id="new", force=False)
    docs = (await db_session.execute(stmt)).scalars().unique().all()
    assert any(d.title == "stale" for d in docs)
