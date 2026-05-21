"""
EntityEmbeddingService orchestration tests — fakes for storage + provider.

Proves the base's behaviour independent of any real entity or DB:
- embed_one skip-if-cached vs. force vs. model change
- find_similar source-unembedded guard + threshold filtering / result shaping
- the portable OR-form keyset cursor predicate

(embed_batch's storage-driven select/pagination is covered against real
Postgres in test_storage_multi_vector.py.)
"""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from pixsim7.backend.main.services.embedding.generic_service import (
    EntityEmbeddingService,
    EntityNotEmbeddedError,
)
from pixsim7.backend.main.services.embedding.storage import (
    SimilarityResult,
    StoredEmbedding,
)


# ── Fakes ─────────────────────────────────────────────────────────────


@dataclass
class _Doc:
    id: int
    text: str
    vector: list[float] | None = None
    model_id: str | None = None


class _FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


class _FakeStorage:
    """In-memory storage. Query-builders are stubbed because the service's
    similarity/batch paths that hit them are exercised in the storage tests;
    here we drive embed_one / find_similar which use get_existing/upsert."""

    def __init__(self) -> None:
        self.rows: dict[tuple[int, str], StoredEmbedding] = {}

    async def get_existing(self, entity: _Doc, *, embedder_id: str):
        return self.rows.get((entity.id, embedder_id))

    async def upsert(self, entity, *, embedder_id, vector, model_id) -> None:
        self.rows[(entity.id, embedder_id)] = StoredEmbedding(
            vector=vector, model_id=model_id, embedder_id=embedder_id
        )

    def build_unembedded_select(self, **_):  # pragma: no cover - not used here
        raise NotImplementedError

    def build_similarity_select(self, **_):  # pragma: no cover - not used here
        raise NotImplementedError


class _DocService(EntityEmbeddingService[_Doc]):
    """Minimal text-flavoured subclass over fakes."""

    def __init__(self, db, storage, **kw) -> None:
        super().__init__(db, storage, **kw)
        self.embed_calls: list[list[str]] = []
        self.fail_on_text: str | None = None

    async def _embed_entities(self, entities, *, model_id):
        texts = [e.text for e in entities]
        self.embed_calls.append(texts)
        if self.fail_on_text is not None and self.fail_on_text in texts:
            raise RuntimeError("provider boom")
        # Deterministic fake vector keyed off the text length.
        return [[float(len(e.text)), 0.0] for e in entities]

    async def _embed_query(self, query, *, model_id):
        return [float(len(query)), 0.0]

    async def _resolve_model_id(self, model_id):
        return model_id or "fake:model"

    def _keyset_columns(self):  # pragma: no cover - batch path uses storage
        raise NotImplementedError


def _service(**kw) -> _DocService:
    return _DocService(_FakeSession(), _FakeStorage(), **kw)


# ── embed_one ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_embed_one_embeds_and_commits():
    svc = _service()
    doc = _Doc(id=1, text="hello")
    result = await svc.embed_one(doc)
    assert result.vector == [5.0, 0.0]
    assert result.model_id == "fake:model"
    assert svc.db.commits == 1
    assert svc.embed_calls == [["hello"]]


@pytest.mark.asyncio
async def test_embed_one_skips_when_cached_same_model():
    svc = _service()
    doc = _Doc(id=1, text="hello")
    await svc.embed_one(doc)
    svc.embed_calls.clear()

    again = await svc.embed_one(doc)
    assert again.vector == [5.0, 0.0]
    assert svc.embed_calls == []  # no re-embed


@pytest.mark.asyncio
async def test_embed_one_force_reembeds():
    svc = _service()
    doc = _Doc(id=1, text="hello")
    await svc.embed_one(doc)
    svc.embed_calls.clear()

    await svc.embed_one(doc, force=True)
    assert svc.embed_calls == [["hello"]]


@pytest.mark.asyncio
async def test_embed_one_reembeds_when_model_changes():
    svc = _service()
    doc = _Doc(id=1, text="hello")
    await svc.embed_one(doc, model_id="m1")
    svc.embed_calls.clear()
    await svc.embed_one(doc, model_id="m2")
    assert svc.embed_calls == [["hello"]]  # different model => not skipped


# ── find_similar ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_find_similar_raises_when_source_unembedded():
    svc = _service()
    with pytest.raises(EntityNotEmbeddedError):
        await svc.find_similar(_Doc(id=1, text="x"))


@pytest.mark.asyncio
async def test_run_similarity_applies_threshold():
    """Drive _run_similarity directly with a storage stub returning a fixed
    result set, to assert threshold filtering + SimilarityResult shaping."""
    svc = _service()

    class _Stub(_FakeStorage):
        def build_similarity_select(self, **_):
            return "STMT"

    svc.storage = _Stub()

    near = _Doc(id=2, text="near")
    far = _Doc(id=3, text="far")

    async def _fake_execute(stmt):
        assert stmt == "STMT"

        class _Res:
            def unique(self_inner):
                return self_inner

            def all(self_inner):
                return [(near, 0.1), (far, 0.8)]

        return _Res()

    svc.db.execute = _fake_execute  # type: ignore[attr-defined]

    results = await svc._run_similarity(
        query_vector=[1.0, 0.0],
        embedding_model="m",
        exclude_entity=None,
        limit=10,
        threshold=0.5,
        filter_kwargs={},
    )
    assert [r.entity for r in results] == [near]  # far (0.8) dropped by threshold
    assert isinstance(results[0], SimilarityResult)
    assert results[0].similarity_score == pytest.approx(0.9)


# ── keyset cursor predicate ───────────────────────────────────────────


def test_keyset_predicate_arity_mismatch_raises():
    from sqlalchemy import Column, Integer

    col = Column("a", Integer)
    with pytest.raises(ValueError):
        EntityEmbeddingService._keyset_cursor_predicate((col,), (1, 2))


def test_keyset_predicate_single_col_is_strict_gt():
    from sqlalchemy import Column, Integer
    from sqlalchemy.dialects import postgresql

    col = Column("a", Integer)
    pred = EntityEmbeddingService._keyset_cursor_predicate((col,), (5,))
    sql = str(pred.compile(dialect=postgresql.dialect()))
    assert "a >" in sql


def test_keyset_predicate_two_cols_or_form():
    from sqlalchemy import Column, DateTime, Integer
    from sqlalchemy.dialects import postgresql

    created = Column("created_at", DateTime)
    ident = Column("id", Integer)
    pred = EntityEmbeddingService._keyset_cursor_predicate(
        (created, ident), ("2026-01-01", 5)
    )
    sql = str(pred.compile(dialect=postgresql.dialect())).replace("\n", " ")
    # (created_at > :v) OR (created_at == :v AND id > :v)
    assert " OR " in sql
    assert "created_at" in sql and "id >" in sql
