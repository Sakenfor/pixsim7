"""
MultiVectorTableStorage — vectors live in a companion table keyed by
(entity_fk, embedder_id), supporting multiple embedders per entity.

Used by:
- Asset (today: AssetEmbedding(asset_id, embedder_id, vector, model_id))

Why this is a separate class from PerRowStorage:
- `get_existing` is a SELECT on the companion table by composite key.
- `upsert` is an INSERT ... ON CONFLICT (entity_fk, embedder_id) DO UPDATE.
- `build_unembedded_select` LEFT JOINs the companion table on entity_fk AND
  embedder_id, then filters where joined row is missing or model_id mismatches.
- `build_similarity_select` JOINs the companion table on entity_fk AND
  embedder_id, then orders by cosine distance.

The composite key (entity_fk, embedder_id) is what makes multi-vector
storage interesting — same entity can have a SigLIP-2 vector AND a
fashion-CLIP vector AND a pose-embedding vector, queryable independently.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Generic, Sequence, TypeVar

from sqlalchemy import ColumnElement, Select, and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from pixsim7.backend.main.shared.datetime_utils import utcnow

from .base import StoredEmbedding

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.orm import InstrumentedAttribute


EntityT = TypeVar("EntityT")


@dataclass(frozen=True, slots=True)
class MultiVectorTable(Generic[EntityT]):
    """Wiring that ties this storage to a specific entity + its companion
    vector table.

    - `entity_model`: the owning entity class (e.g. Asset)
    - `vector_model`: the companion table class (e.g. AssetEmbedding)
    - `entity_pk`: PK column on `entity_model` (e.g. Asset.id)
    - `entity_fk`: column on `vector_model` that FKs back to entity PK
    - `embedder_id_column`: column on `vector_model` storing embedder_id
    - `vector_column`: pgvector Vector(N) column on `vector_model`
    - `model_id_column`: str column on `vector_model` recording provenance
    - `generated_at_column`: optional timestamp column on `vector_model`
    """

    entity_model: type
    vector_model: type
    entity_pk: "InstrumentedAttribute"
    entity_fk: "InstrumentedAttribute"
    embedder_id_column: "InstrumentedAttribute"
    vector_column: "InstrumentedAttribute"
    model_id_column: "InstrumentedAttribute"
    generated_at_column: "InstrumentedAttribute | None" = None


class MultiVectorTableStorage(Generic[EntityT]):
    """EmbeddingStorage impl for entities with a companion vector table."""

    def __init__(self, db: "AsyncSession", table: MultiVectorTable[EntityT]) -> None:
        self.db = db
        self.table = table

    async def get_existing(
        self,
        entity: EntityT,
        *,
        embedder_id: str,
    ) -> StoredEmbedding | None:
        entity_pk_value = getattr(entity, self.table.entity_pk.key)
        stmt = select(
            self.table.vector_column,
            self.table.model_id_column,
        ).where(
            and_(
                self.table.entity_fk == entity_pk_value,
                self.table.embedder_id_column == embedder_id,
            )
        )
        row = (await self.db.execute(stmt)).one_or_none()
        if row is None:
            return None
        vector, model_id = row
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
        entity_pk_value = getattr(entity, self.table.entity_pk.key)
        values: dict = {
            self.table.entity_fk.key: entity_pk_value,
            self.table.embedder_id_column.key: embedder_id,
            self.table.vector_column.key: vector,
            self.table.model_id_column.key: model_id,
        }
        if self.table.generated_at_column is not None:
            values[self.table.generated_at_column.key] = utcnow()

        stmt = pg_insert(self.table.vector_model).values(**values)
        update_set: dict = {
            self.table.vector_column.key: stmt.excluded[self.table.vector_column.key],
            self.table.model_id_column.key: stmt.excluded[self.table.model_id_column.key],
        }
        if self.table.generated_at_column is not None:
            update_set[self.table.generated_at_column.key] = stmt.excluded[
                self.table.generated_at_column.key
            ]
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                self.table.entity_fk,
                self.table.embedder_id_column,
            ],
            set_=update_set,
        )
        await self.db.execute(stmt)

    def build_unembedded_select(
        self,
        *,
        embedder_id: str,
        model_id: str,
        force: bool,
        additional_filters: Sequence[ColumnElement[bool]] = (),
    ) -> Select:
        join_predicate = and_(
            self.table.entity_fk == self.table.entity_pk,
            self.table.embedder_id_column == embedder_id,
        )
        stmt = select(self.table.entity_model).outerjoin(
            self.table.vector_model, join_predicate
        )
        conditions: list[ColumnElement[bool]] = []
        if not force:
            conditions.append(
                or_(
                    self.table.vector_column.is_(None),
                    self.table.model_id_column != model_id,
                )
            )
        conditions.extend(additional_filters)
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
        distance_expr = self.table.vector_column.cosine_distance(query_vector)
        join_predicate = and_(
            self.table.entity_fk == self.table.entity_pk,
            self.table.embedder_id_column == embedder_id,
        )

        conditions: list[ColumnElement[bool]] = []
        if embedding_model:
            conditions.append(self.table.model_id_column == embedding_model)
        if exclude_entity is not None:
            exclude_pk = getattr(exclude_entity, self.table.entity_pk.key)
            conditions.append(self.table.entity_pk != exclude_pk)
        conditions.extend(additional_filters)

        stmt = (
            select(self.table.entity_model, distance_expr.label("distance"))
            .join(self.table.vector_model, join_predicate)
        )
        if conditions:
            stmt = stmt.where(and_(*conditions))
        return stmt.order_by(distance_expr).limit(limit)
