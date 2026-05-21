"""
EmbeddingStorage protocol — hide WHERE a vector lives from the generic service.

Two storage flavours exist in the codebase and stay physically separate (FK clean):

- PerRowStorage: vector + model lives in columns on the entity row itself
  (today: BlockPrimitive.embedding / .embedding_model; planned: PromptVersion).

- MultiVectorTableStorage: vector lives in a companion table keyed by
  (entity_fk, embedder_id), supporting multiple embedders per entity
  (today: AssetEmbedding(asset_id, embedder_id, vector, model_id)).

The generic EntityEmbeddingService talks only to this protocol — it never
reaches into entity columns or companion tables directly. That's the whole
point: subclasses pick a storage flavour, the orchestration code stays one
implementation.

Design notes
------------
- Entity-centric API. Callers always load the entity first (they need it for
  embed-input building anyway), then hand it to storage. PerRow then has zero
  extra reads; MultiVector reads its companion row when asked.

- Filters are passed as raw SQLAlchemy ColumnElement[bool] sequences. Storage
  doesn't know what `BlockPrimitive.category == ...` means; it just AND's
  them into its base query. Keeps the protocol entity-agnostic.

- Similarity returns `SimilarityResult[EntityT]` — a single shape across all
  consumers. Subclasses adapt to their public return shape (e.g. block service
  may want `{"block": ..., "distance": ...}` dicts for back-compat).

- `embedder_id` is on every method. PerRow storage matches it against an
  `embedder_id` column when present (blocks will get one in Phase B for
  forward-compat with SigLIP cross-modal); MultiVector uses it as half of
  the composite key. No optionality — pick a value (default "primary") and
  pass it consistently.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Protocol, Sequence, TypeVar

from sqlalchemy import ColumnElement, Select


EntityT = TypeVar("EntityT")


@dataclass(frozen=True, slots=True)
class StoredEmbedding:
    """The vector + provenance metadata returned by Storage.get_existing()."""

    vector: list[float]
    model_id: str
    embedder_id: str


@dataclass(frozen=True, slots=True)
class SimilarityResult(Generic[EntityT]):
    """One row of a similarity search result. `distance` is the raw metric
    (cosine distance today: 0 = identical, 2 = opposite). `similarity_score`
    is the convention used by current callers (1 - distance)."""

    entity: EntityT
    distance: float

    @property
    def similarity_score(self) -> float:
        return 1.0 - self.distance


class EmbeddingStorage(Protocol[EntityT]):
    """Hide vector-storage flavour from the generic service.

    All methods are async. SQLAlchemy AsyncSession is held by the concrete
    implementation, injected by the entity service at construction. Storage
    never owns the session lifecycle — it borrows it for the duration of
    each call and never commits (the service decides commit boundaries).
    """

    # ----- read -----

    async def get_existing(
        self,
        entity: EntityT,
        *,
        embedder_id: str,
    ) -> StoredEmbedding | None:
        """Return the stored embedding for (entity, embedder_id), or None.

        Used by:
        - skip-if-already-embedded check in embed_one
        - source-vector lookup for find_similar(source_entity)
        """
        ...

    # ----- write -----

    async def upsert(
        self,
        entity: EntityT,
        *,
        embedder_id: str,
        vector: list[float],
        model_id: str,
    ) -> None:
        """Persist `vector` for (entity, embedder_id). Idempotent under the
        same (entity, embedder_id); replaces any prior vector.

        Does NOT commit. The caller (service) decides when to commit so
        batches can group writes into one transaction."""
        ...

    # ----- query building (returned, not executed) -----

    def build_unembedded_select(
        self,
        *,
        embedder_id: str,
        model_id: str,
        force: bool,
        additional_filters: Sequence[ColumnElement[bool]] = (),
    ) -> Select:
        """A Select that yields entities still needing embedding.

        - If `force` is True: no embedding-status predicate; return all
          entities matching `additional_filters`.
        - If False: filter to entities with no embedding for this
          embedder_id, or whose stored model_id differs from `model_id`.

        Caller adds ordering / pagination (keyset). Storage never paginates
        on its own — Phase A makes no assumption about cursor shape.
        """
        ...

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
        """A Select yielding `(EntityT, distance: float)` rows ordered by
        ascending distance.

        - `embedding_model` is optional: if set, restricts to rows whose
          stored model_id matches (keeps vector spaces from mixing).
        - `exclude_entity` excludes the source row from a "find similar to X"
          query. Implementations use whatever key column is appropriate
          (block_id string for blocks, id int for assets).
        """
        ...
