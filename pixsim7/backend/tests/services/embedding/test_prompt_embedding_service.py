"""
PromptEmbeddingService end-to-end — real Postgres + pgvector.

Exercises the Phase-C path the SQL-shape unit tests can't: embed several
prompt versions, then run a vector query and assert cosine ordering. The text
provider is faked via the embedding locator override so vectors are
deterministic; everything else (storage upsert, similarity select, model-match
filter) is the real generic machinery.

Stands up an isolated schema with just prompt_families + prompt_versions on the
real SQLModel metadata (the only FK is prompt_versions → prompt_families, both
created). Skips cleanly if pgvector is unavailable.
"""
from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from pixsim7.backend.main.domain.prompt import PromptFamily, PromptVersion
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.embedding.prompt_service import (
    PromptEmbeddingService,
    PromptVersionNotEmbeddedError,
)
from pixsim7.backend.main.shared.config import settings
from pixsim7.embedding.locator import locator
from pixsim7.embedding.protocol import EmbedResult, EmbedTextRequest

pytestmark = pytest.mark.asyncio

_DIM = 768
# Explicit model id so the service skips the ai_models default-model lookup,
# which has no table in the isolated test schema.
_MODEL = "openai:text-embedding-3-small"


def _axis_vector(*components: tuple[int, float]) -> list[float]:
    """768-dim vector with the given (axis, value) components set, rest zero."""
    v = [0.0] * _DIM
    for axis, value in components:
        v[axis] = value
    return v


# Deterministic text → vector map. Axis 0 is "apple-ness", axis 1 is "car-ness".
_TEXT_VECTORS: dict[str, list[float]] = {
    "a red apple on a table": _axis_vector((0, 1.0)),
    "a green apple in a bowl": _axis_vector((0, 0.92), (1, 0.39)),
    "a fast sports car": _axis_vector((1, 1.0)),
    "apple": _axis_vector((0, 1.0)),  # query
}


class _FakeTextEmbedder:
    """Minimal EmbeddingService satisfying embed_texts for the test."""

    async def embed_images(self, request):  # pragma: no cover - unused
        raise NotImplementedError

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        vectors = [list(_TEXT_VECTORS[t]) for t in request.texts]
        return EmbedResult(vectors=vectors, dim=_DIM, model_id=request.model_id)

    async def shutdown(self) -> None:  # pragma: no cover - unused
        return None


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_prompt_embed_{uuid4().hex}"
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
                lambda sync_conn: PromptVersion.metadata.create_all(
                    sync_conn,
                    tables=[PromptFamily.__table__, PromptVersion.__table__],
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


async def _add_version(db: AsyncSession, prompt_text: str) -> PromptVersion:
    version = PromptVersion(
        prompt_text=prompt_text,
        prompt_hash=PromptVersion.compute_hash(prompt_text),
    )
    db.add(version)
    await db.flush()
    return version


async def test_embed_then_vector_search_orders_by_similarity(db_session: AsyncSession):
    red = await _add_version(db_session, "a red apple on a table")
    green = await _add_version(db_session, "a green apple in a bowl")
    car = await _add_version(db_session, "a fast sports car")
    await db_session.flush()

    service = PromptEmbeddingService(db_session)
    with locator.override(_FakeTextEmbedder()):
        for v in (red, green, car):
            await service.embed_version(v, model_id=_MODEL)

        results = await service.find_similar_by_text("apple", model_id=_MODEL, limit=10)

    texts = [r["prompt_text"] for r in results]
    # All three returned, ordered by cosine similarity to the apple query.
    assert texts == [
        "a red apple on a table",
        "a green apple in a bowl",
        "a fast sports car",
    ]
    # Identical-direction match scores ~1.0; orthogonal car scores ~0.0.
    assert results[0]["similarity_score"] == pytest.approx(1.0, abs=1e-3)
    assert results[-1]["similarity_score"] == pytest.approx(0.0, abs=1e-3)
    # Monotonically non-increasing.
    scores = [r["similarity_score"] for r in results]
    assert scores == sorted(scores, reverse=True)


async def test_min_similarity_filters_orthogonal(db_session: AsyncSession):
    red = await _add_version(db_session, "a red apple on a table")
    car = await _add_version(db_session, "a fast sports car")
    await db_session.flush()

    service = PromptEmbeddingService(db_session)
    with locator.override(_FakeTextEmbedder()):
        await service.embed_version(red, model_id=_MODEL)
        await service.embed_version(car, model_id=_MODEL)
        results = await service.find_similar_by_text(
            "apple", model_id=_MODEL, limit=10, min_similarity=0.5
        )

    texts = [r["prompt_text"] for r in results]
    assert texts == ["a red apple on a table"]  # car (sim ~0) filtered out


async def test_find_similar_requires_embedded_source(db_session: AsyncSession):
    source = await _add_version(db_session, "a red apple on a table")
    await db_session.flush()

    service = PromptEmbeddingService(db_session)
    with pytest.raises(PromptVersionNotEmbeddedError):
        await service.find_similar(source.id)


async def test_find_similar_returns_neighbors(db_session: AsyncSession):
    red = await _add_version(db_session, "a red apple on a table")
    green = await _add_version(db_session, "a green apple in a bowl")
    car = await _add_version(db_session, "a fast sports car")
    await db_session.flush()

    service = PromptEmbeddingService(db_session)
    with locator.override(_FakeTextEmbedder()):
        for v in (red, green, car):
            await service.embed_version(v, model_id=_MODEL)
        results = await service.find_similar(red.id, limit=10)

    texts = [r["prompt_text"] for r in results]
    assert "a red apple on a table" not in texts  # source excluded
    assert texts[0] == "a green apple in a bowl"  # nearest neighbor first
