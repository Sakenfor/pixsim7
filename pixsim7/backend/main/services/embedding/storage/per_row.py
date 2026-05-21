"""
PerRowStorage — vector + model live in columns on the entity row itself.

Used by:
- BlockPrimitive (today: embedding, embedding_model; Phase B adds embedder_id)
- PromptVersion (Phase C: same columns)

Why this is a separate class from MultiVectorTableStorage:
- `get_existing` is a plain attribute read on the loaded entity. No DB hit.
- `upsert` mutates entity attrs; commit happens at the service level.
- Queries don't JOIN — embedding column is on the entity table itself.

The `embedder_id` column is optional in the wiring bundle because blocks
today have no such column (single-vector). Phase B adds it; until then
PerRowStorage stores a single primary embedding and treats `embedder_id`
as informational ("primary" by convention) without column filtering.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Generic, Sequence, TypeVar

from sqlalchemy import ColumnElement, Select, and_, or_, select

from .base import StoredEmbedding

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import InstrumentedAttribute


EntityT = TypeVar("EntityT")


@dataclass(frozen=True, slots=True)
class PerRowColumns(Generic[EntityT]):
    """SQLAlchemy column references wiring this storage to a specific entity
    table. The subclass of EntityEmbeddingService passes one of these in.

    - `vector`: pgvector Vector(N) column holding the embedding
    - `model`: str column recording the model_id that produced it
    - `embedder_id`: optional column for embedder_id (Phase B+); if None,
      storage treats embedder_id as informational and doesn't filter by it
    - `exclude_column`: column used to exclude the source entity in
      similarity queries (e.g. BlockPrimitive.block_id for blocks)
    """

    vector: "InstrumentedAttribute"
    model: "InstrumentedAttribute"
    embedder_id: "InstrumentedAttribute | None" = None
    exclude_column: "InstrumentedAttribute | None" = None

    @property
    def entity_class(self) -> type:
        return self.vector.class_


class PerRowStorage(Generic[EntityT]):
    """EmbeddingStorage impl for entities with embedding columns on the row."""

    def __init__(self, db: "AsyncSession", columns: PerRowColumns[EntityT]) -> None:
        self.db = db
        self.columns = columns

    async def get_existing(
        self,
        entity: EntityT,
        *,
        embedder_id: str,
    ) -> StoredEmbedding | None:
        vector = getattr(entity, self.columns.vector.key)
        if vector is None:
            return None
        model_id = getattr(entity, self.columns.model.key)
        if self.columns.embedder_id is not None:
            stored_embedder = getattr(entity, self.columns.embedder_id.key)
            if stored_embedder != embedder_id:
                return None
            return StoredEmbedding(
                vector=list(vector),
                model_id=model_id or "",
                embedder_id=stored_embedder or embedder_id,
            )
        return StoredEmbedding(
            vector=list(vector),
            model_id=model_id or "",
            embedder_id=embedder_id,
        )

    async def upsert(
        self,
        entity: EntityT,
        *,
        embedder_id: str,
        vector: list[float],
        model_id: str,
    ) -> None:
        setattr(entity, self.columns.vector.key, vector)
        setattr(entity, self.columns.model.key, model_id)
        if self.columns.embedder_id is not None:
            setattr(entity, self.columns.embedder_id.key, embedder_id)

    def build_unembedded_select(
        self,
        *,
        embedder_id: str,
        model_id: str,
        force: bool,
        additional_filters: Sequence[ColumnElement[bool]] = (),
    ) -> Select:
        entity_cls = self.columns.entity_class
        conditions: list[ColumnElement[bool]] = []
        if not force:
            stale_or_missing = or_(
                self.columns.vector.is_(None),
                self.columns.model != model_id,
            )
            if self.columns.embedder_id is not None:
                stale_or_missing = or_(
                    stale_or_missing,
                    self.columns.embedder_id != embedder_id,
                )
            conditions.append(stale_or_missing)
        if self.columns.embedder_id is not None:
            conditions.append(
                or_(
                    self.columns.embedder_id == embedder_id,
                    self.columns.embedder_id.is_(None),
                )
            )
        conditions.extend(additional_filters)
        stmt = select(entity_cls)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        return stmt

    def build_similarity_select(
        self,
        *,
        query_vector: list[float],
        embedder_id: str,
        embedding_model: str | None,
        additional_filters: Sequence[ColumnElement[bool]] = (),
        exclude_entity: EntityT | None = None,
        limit: int,
    ) -> Select:
        entity_cls = self.columns.entity_class
        distance_expr = self.columns.vector.cosine_distance(query_vector)

        conditions: list[ColumnElement[bool]] = [self.columns.vector.isnot(None)]
        if embedding_model:
            conditions.append(self.columns.model == embedding_model)
        if self.columns.embedder_id is not None:
            conditions.append(self.columns.embedder_id == embedder_id)
        if exclude_entity is not None and self.columns.exclude_column is not None:
            exclude_value = getattr(exclude_entity, self.columns.exclude_column.key)
            conditions.append(self.columns.exclude_column != exclude_value)
        conditions.extend(additional_filters)

        return (
            select(entity_cls, distance_expr.label("distance"))
            .where(and_(*conditions))
            .order_by(distance_expr)
            .limit(limit)
        )
