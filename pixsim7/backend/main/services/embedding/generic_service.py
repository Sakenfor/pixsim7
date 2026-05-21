"""
EntityEmbeddingService[EntityT] — entity-agnostic embedding orchestration.

Subclasses parameterize three things via abstract hooks:
- modality / provider: `_embed_entities` + `_embed_query` (text vs image vs other)
- model defaulting: `_resolve_model_id`
- entity-specific filters + keyset pagination: `_entity_filters` + `_keyset_columns`

Everything else — storage delegation, batch loop with keyset pagination,
similarity orchestration, threshold + skip-if-cached logic, commit
boundaries — lives here once.

Note on type parameters: the original plan signature was
`EntityEmbeddingService[EntityT, KeyT]`. KeyT was dropped during a1 design
because the base never sees keys directly — callers always pass loaded
entities. Key resolution (block UUID|str dual-key, asset int) is a subclass
concern handled before calling embed_one / find_similar.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Generic, Mapping, Sequence, TypeVar

from sqlalchemy import ColumnElement, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from .storage import EmbeddingStorage, SimilarityResult, StoredEmbedding


logger = logging.getLogger(__name__)


EntityT = TypeVar("EntityT")

DEFAULT_BATCH_SIZE = 64
DEFAULT_EMBEDDER_ID = "primary"


@dataclass(frozen=True, slots=True)
class BatchStats:
    """Return shape for embed_batch."""

    embedded_count: int
    skipped_count: int
    total: int
    model_id: str


class EntityEmbeddingService(ABC, Generic[EntityT]):
    """Generic embedding orchestration.

    Concrete subclasses wire up:
    - `storage`: a PerRowStorage or MultiVectorTableStorage instance
    - `_embed_entities` / `_embed_query`: modality-specific provider calls
    - `_resolve_model_id`: default model selection
    - `_entity_filters` / `_keyset_columns`: entity-specific batch shape

    The base owns commit boundaries: one commit per batch in embed_batch,
    one commit at the end of embed_one. Storage methods never commit.
    """

    def __init__(
        self,
        db: AsyncSession,
        storage: EmbeddingStorage[EntityT],
        *,
        embedder_id: str = DEFAULT_EMBEDDER_ID,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> None:
        self.db = db
        self.storage = storage
        self.embedder_id = embedder_id
        self.batch_size = batch_size

    # ===== subclass hooks =====

    @abstractmethod
    async def _embed_entities(
        self, entities: Sequence[EntityT], *, model_id: str
    ) -> list[list[float]]:
        """Build provider inputs from entities, call the provider, validate
        the returned vectors. Return list aligned by entity index.

        Implementations live in subclasses because:
        - input building reads entity-specific columns
        - text vs image picks a different provider / sibling endpoint
        - dim expectations differ (768 text, 1024 SigLIP)

        Raise to abort the whole batch; the base catches, rolls back, and
        marks all entities in the batch as skipped.
        """

    @abstractmethod
    async def _embed_query(self, query: Any, *, model_id: str) -> list[float]:
        """Embed a single arbitrary input (text string for text services,
        path for image services). Used by `find_similar_by_query`."""

    @abstractmethod
    async def _resolve_model_id(self, model_id: str | None) -> str:
        """Resolve the model_id to use: explicit > capability default > fallback."""

    def _entity_filters(
        self, **kwargs: Any
    ) -> Sequence[ColumnElement[bool]]:
        """Convert subclass-flavored filter kwargs into SQLAlchemy conditions.

        Default: no filters. Subclasses override to pull role/category/etc.
        out of kwargs and turn them into ColumnElement[bool]."""
        return ()

    @abstractmethod
    def _keyset_columns(self) -> tuple[ColumnElement, ...]:
        """Columns to order + cursor on for batch pagination.

        Tuple-style keyset: ordering is by these columns ascending; the
        cursor advances after each batch using the standard OR-form
        predicate (see _keyset_cursor_predicate)."""

    # ===== shared embed flow =====

    async def embed_one(
        self,
        entity: EntityT,
        *,
        model_id: str | None = None,
        force: bool = False,
    ) -> StoredEmbedding:
        """Embed a single entity. Idempotent when force=False: if a vector
        for (entity, embedder_id, model_id) already exists, returns it.

        Commits on success. Caller is responsible for any prior rollback
        on the session.
        """
        resolved_model = await self._resolve_model_id(model_id)

        if not force:
            existing = await self.storage.get_existing(
                entity, embedder_id=self.embedder_id
            )
            if existing is not None and existing.model_id == resolved_model:
                logger.debug(
                    "Entity already embedded with %s, skipping", resolved_model
                )
                return existing

        vectors = await self._embed_entities([entity], model_id=resolved_model)
        if len(vectors) != 1:
            raise RuntimeError(
                f"_embed_entities returned {len(vectors)} vectors for 1 entity"
            )
        vector = vectors[0]

        await self.storage.upsert(
            entity,
            embedder_id=self.embedder_id,
            vector=vector,
            model_id=resolved_model,
        )
        await self.db.commit()

        return StoredEmbedding(
            vector=vector, model_id=resolved_model, embedder_id=self.embedder_id
        )

    async def embed_batch(
        self,
        *,
        model_id: str | None = None,
        force: bool = False,
        **filter_kwargs: Any,
    ) -> BatchStats:
        """Batch-embed all entities matching `filter_kwargs` that need it.

        Uses keyset pagination from `_keyset_columns()` to avoid loading
        all candidates into memory. Each DB chunk is embedded and committed
        independently. Provider failures roll back the failing batch and
        skip it; commit failures roll back and re-raise (fail-fast).
        """
        from sqlalchemy import func, select

        resolved_model = await self._resolve_model_id(model_id)
        filters = list(self._entity_filters(**filter_kwargs))
        keyset_cols = self._keyset_columns()
        if not keyset_cols:
            raise RuntimeError(
                "_keyset_columns() must return at least one column"
            )

        # Cheap count up-front for stats.
        count_stmt = self.storage.build_unembedded_select(
            embedder_id=self.embedder_id,
            model_id=resolved_model,
            force=force,
            additional_filters=filters,
        )
        count_stmt = select(func.count()).select_from(count_stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        embedded_count = 0
        skipped_count = 0
        cursor: tuple | None = None

        while True:
            conditions = list(filters)
            if cursor is not None:
                conditions.append(self._keyset_cursor_predicate(keyset_cols, cursor))

            stmt = self.storage.build_unembedded_select(
                embedder_id=self.embedder_id,
                model_id=resolved_model,
                force=force,
                additional_filters=conditions,
            )
            stmt = stmt.order_by(*keyset_cols).limit(self.batch_size)

            result = await self.db.execute(stmt)
            batch = list(result.scalars().unique().all())
            if not batch:
                break

            cursor = tuple(getattr(batch[-1], col.key) for col in keyset_cols)

            try:
                vectors = await self._embed_entities(batch, model_id=resolved_model)
                if len(vectors) != len(batch):
                    raise RuntimeError(
                        f"_embed_entities returned {len(vectors)} vectors "
                        f"for {len(batch)} entities"
                    )
            except Exception as exc:
                logger.error(
                    "Batch embedding failed (cursor=%s): %s", cursor, exc
                )
                skipped_count += len(batch)
                await self.db.rollback()
                continue

            for entity, vector in zip(batch, vectors):
                await self.storage.upsert(
                    entity,
                    embedder_id=self.embedder_id,
                    vector=vector,
                    model_id=resolved_model,
                )
                embedded_count += 1

            try:
                await self.db.commit()
            except Exception:
                logger.exception("Batch commit failed (cursor=%s)", cursor)
                await self.db.rollback()
                raise

            logger.info(
                "Embedded batch of %d entities (cursor=%s)", len(batch), cursor
            )

        return BatchStats(
            embedded_count=embedded_count,
            skipped_count=skipped_count,
            total=total,
            model_id=resolved_model,
        )

    @staticmethod
    def _keyset_cursor_predicate(
        keyset_cols: tuple[ColumnElement, ...], cursor: tuple
    ) -> ColumnElement[bool]:
        """Standard OR-form keyset cursor predicate.

        For columns (a, b) and cursor (av, bv):
            (a > av) OR (a == av AND b > bv)

        Generalized to N columns. Portable across DBs (vs. row-value
        comparison which Postgres supports but some test backends don't)."""
        if len(keyset_cols) != len(cursor):
            raise ValueError("keyset_cols and cursor must have same arity")

        clauses: list[ColumnElement[bool]] = []
        for i in range(len(keyset_cols)):
            equal_prefix = [keyset_cols[j] == cursor[j] for j in range(i)]
            strict = keyset_cols[i] > cursor[i]
            if equal_prefix:
                clauses.append(and_(*equal_prefix, strict))
            else:
                clauses.append(strict)
        return or_(*clauses)

    # ===== shared similarity flow =====

    async def find_similar(
        self,
        source: EntityT,
        *,
        limit: int = 10,
        threshold: float | None = None,
        **filter_kwargs: Any,
    ) -> list[SimilarityResult[EntityT]]:
        """Find entities similar to `source`. Source must be already embedded
        with this service's embedder_id."""
        existing = await self.storage.get_existing(
            source, embedder_id=self.embedder_id
        )
        if existing is None:
            raise EntityNotEmbeddedError(
                f"Source entity has no embedding for embedder_id={self.embedder_id!r}"
            )

        return await self._run_similarity(
            query_vector=existing.vector,
            embedding_model=existing.model_id,
            exclude_entity=source,
            limit=limit,
            threshold=threshold,
            filter_kwargs=filter_kwargs,
        )

    async def find_similar_by_query(
        self,
        query: Any,
        *,
        model_id: str | None = None,
        limit: int = 10,
        threshold: float | None = None,
        **filter_kwargs: Any,
    ) -> list[SimilarityResult[EntityT]]:
        """Find entities similar to an arbitrary query (text/image path/etc.).

        `query` shape is whatever `_embed_query` accepts in this subclass."""
        resolved_model = await self._resolve_model_id(model_id)
        query_vector = await self._embed_query(query, model_id=resolved_model)

        return await self._run_similarity(
            query_vector=query_vector,
            embedding_model=resolved_model,
            exclude_entity=None,
            limit=limit,
            threshold=threshold,
            filter_kwargs=filter_kwargs,
        )

    async def _run_similarity(
        self,
        *,
        query_vector: list[float],
        embedding_model: str | None,
        exclude_entity: EntityT | None,
        limit: int,
        threshold: float | None,
        filter_kwargs: Mapping[str, Any],
    ) -> list[SimilarityResult[EntityT]]:
        filters = self._entity_filters(**filter_kwargs)
        stmt = self.storage.build_similarity_select(
            query_vector=query_vector,
            embedder_id=self.embedder_id,
            embedding_model=embedding_model,
            additional_filters=filters,
            exclude_entity=exclude_entity,
            limit=limit,
        )
        result = await self.db.execute(stmt)
        rows = result.unique().all()

        out: list[SimilarityResult[EntityT]] = []
        for row in rows:
            entity, distance = row
            distance_f = float(distance)
            if threshold is not None and distance_f > threshold:
                continue
            out.append(SimilarityResult(entity=entity, distance=distance_f))
        return out


class EntityNotEmbeddedError(Exception):
    """Source entity passed to find_similar has no embedding yet."""
