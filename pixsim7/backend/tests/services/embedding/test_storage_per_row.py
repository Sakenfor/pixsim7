"""
PerRowStorage tests — fake entity, no database.

Per the Phase-A test plan: PerRowStorage is exercised against an isolated
fake entity (its own DeclarativeBase / MetaData, never touches the global
SQLModel registry). get_existing / upsert are pure attribute ops; the
query-builders are checked by compiling to PostgreSQL SQL and asserting the
shape (no execution — pgvector cosine round-trips are MultiVector's job).
"""
from __future__ import annotations

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from pixsim7.backend.main.services.embedding.storage import (
    PerRowColumns,
    PerRowStorage,
    StoredEmbedding,
)


class _Base(DeclarativeBase):
    pass


class _FakeDoc(_Base):
    __tablename__ = "fake_doc_per_row"

    id: Mapped[int] = mapped_column(primary_key=True)
    doc_key: Mapped[str] = mapped_column()
    category: Mapped[str | None] = mapped_column(nullable=True)
    embedding = mapped_column(Vector(4), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(nullable=True)


def _columns_without_embedder() -> PerRowColumns:
    """Wiring as blocks have it today: no embedder_id column."""
    return PerRowColumns(
        vector=_FakeDoc.embedding,
        model=_FakeDoc.embedding_model,
        exclude_column=_FakeDoc.doc_key,
    )


def _storage() -> PerRowStorage:
    return PerRowStorage(db=None, columns=_columns_without_embedder())  # type: ignore[arg-type]


def _compile(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": False},
        )
    )


# ── get_existing (pure attribute reads) ───────────────────────────────


@pytest.mark.asyncio
async def test_get_existing_returns_none_when_unembedded():
    doc = _FakeDoc(id=1, doc_key="a")
    result = await _storage().get_existing(doc, embedder_id="primary")
    assert result is None


@pytest.mark.asyncio
async def test_get_existing_returns_stored_embedding():
    doc = _FakeDoc(id=1, doc_key="a", embedding=[0.1, 0.2, 0.3, 0.4],
                   embedding_model="openai:text-embedding-3-small")
    result = await _storage().get_existing(doc, embedder_id="primary")
    assert isinstance(result, StoredEmbedding)
    assert result.vector == [0.1, 0.2, 0.3, 0.4]
    assert result.model_id == "openai:text-embedding-3-small"
    assert result.embedder_id == "primary"  # informational when no column


# ── upsert (pure attribute writes, no commit) ─────────────────────────


@pytest.mark.asyncio
async def test_upsert_sets_columns():
    doc = _FakeDoc(id=1, doc_key="a")
    await _storage().upsert(
        doc, embedder_id="primary", vector=[1.0, 2.0, 3.0, 4.0], model_id="m"
    )
    assert doc.embedding == [1.0, 2.0, 3.0, 4.0]
    assert doc.embedding_model == "m"


# ── build_unembedded_select ───────────────────────────────────────────


def test_unembedded_select_filters_missing_or_stale():
    stmt = _storage().build_unembedded_select(
        embedder_id="primary", model_id="m1", force=False
    )
    sql = _compile(stmt)
    assert "fake_doc_per_row" in sql
    assert "embedding IS NULL" in sql
    assert "embedding_model" in sql  # stale-model predicate present


def test_unembedded_select_force_drops_status_predicate():
    stmt = _storage().build_unembedded_select(
        embedder_id="primary", model_id="m1", force=True
    )
    sql = _compile(stmt)
    assert "IS NULL" not in sql  # no embedding-status predicate under force


def test_unembedded_select_appends_additional_filters():
    stmt = _storage().build_unembedded_select(
        embedder_id="primary",
        model_id="m1",
        force=True,
        additional_filters=[_FakeDoc.category == "scene"],
    )
    sql = _compile(stmt)
    assert "category" in sql


# ── build_similarity_select ───────────────────────────────────────────


def test_similarity_select_orders_by_cosine_distance():
    stmt = _storage().build_similarity_select(
        query_vector=[0.1, 0.2, 0.3, 0.4],
        embedder_id="primary",
        embedding_model="m1",
        limit=5,
    )
    sql = _compile(stmt)
    assert "<=>" in sql  # pgvector cosine distance operator
    assert "ORDER BY" in sql
    assert "LIMIT" in sql
    assert "embedding_model" in sql  # model match keeps spaces from mixing


def test_similarity_select_excludes_source_entity():
    source = _FakeDoc(id=9, doc_key="self")
    stmt = _storage().build_similarity_select(
        query_vector=[0.1, 0.2, 0.3, 0.4],
        embedder_id="primary",
        embedding_model=None,
        exclude_entity=source,
        limit=5,
    )
    sql = _compile(stmt)
    assert "doc_key" in sql  # exclusion predicate uses the exclude_column
