"""
Prompt embedding service — thin PromptVersion subclass of the generic
EntityEmbeddingService (plan: embedding-service-generalization, Phase C).

Public facade:
- embed_version: embed a single prompt version (by UUID or loaded entity)
- embed_versions_batch: batch-embed versions that need it (optional family filter)
- find_similar: find versions similar to a given version
- find_similar_by_text: find versions similar to arbitrary text

Orchestration (batch keyset loop, similarity query, commit boundaries,
skip-if-cached) lives in EntityEmbeddingService. Vector storage is delegated
to PerRowStorage over PromptVersion's embedding columns. Raw text→vector goes
through the bound EmbeddingService (locator) — this service never touches the
provider registry directly (keeps the locator the single door; see plan
embedding-service-generalization, option-1 guardrail).

A prompt version carries a single *primary* text vector. The cross-modal
SigLIP angle (prompt-text → asset search) is deferred: PerRowStorage holds one
vector per row, so a parallel embedder would need a second column or a move to
MultiVectorTableStorage. See the plan's Phase C notes.
"""
from __future__ import annotations

import logging
import math
from collections import OrderedDict
from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.services.ai_model.defaults import (
    FALLBACK_DEFAULTS,
    get_default_model,
)
from pixsim7.backend.main.services.embedding.generic_service import (
    EntityEmbeddingService,
    EntityNotEmbeddedError,
)
from pixsim7.backend.main.services.embedding.storage import (
    PerRowColumns,
    PerRowStorage,
    SimilarityResult,
)
from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability

from pixsim7.embedding.validation import validate_embeddings as _validate_embeddings
from pixsim7.embedding.locator import get_embedding_service
from pixsim7.embedding.protocol import EmbedTextRequest

logger = logging.getLogger(__name__)

BATCH_SIZE = 64
EXPECTED_DIMENSIONS = 768

# Process-wide LRU of query text → vector, shared across requests (each request
# builds a fresh service instance). Bounds the cost of re-embedding the same
# similar-search query on control refinements. ~256 * 768 floats ≈ 1.5 MB.
_QUERY_VECTOR_CACHE: "OrderedDict[tuple[str, str], list[float]]" = OrderedDict()
_QUERY_VECTOR_CACHE_MAX = 256

# Hybrid re-rank (rank="hybrid"): nudge semantically-similar prompts that have
# actually produced successful generations toward the top. We over-fetch a
# candidate pool, blend each one's semantic similarity with a saturating boost
# from its successful_assets count, then trim to the requested limit. Similarity
# stays dominant — the boost only reorders within an already-relevant pool.
_HYBRID_SUCCESS_WEIGHT = 0.30        # max share of the blended score the boost contributes
_HYBRID_SUCCESS_SATURATION = 12      # successful_assets at which the boost ~saturates to 1.0
_HYBRID_OVERFETCH = 4                # candidate pool = limit * this, before re-rank
_HYBRID_MAX_CANDIDATES = 60          # hard cap on the candidate pool

__all__ = [
    "PromptEmbeddingService",
    "PromptVersionNotFoundError",
    "PromptVersionNotEmbeddedError",
]


class PromptVersionNotFoundError(LookupError):
    """Prompt version not found in database (maps to 404)."""


class PromptVersionNotEmbeddedError(Exception):
    """Prompt version exists but has no embedding yet (maps to 422)."""


class PromptEmbeddingService(EntityEmbeddingService[PromptVersion]):
    """Embedding generation + similarity search for prompt versions."""

    def __init__(self, db: AsyncSession, *, batch_size: int = BATCH_SIZE):
        storage = PerRowStorage(
            db,
            PerRowColumns(
                vector=PromptVersion.embedding,
                model=PromptVersion.embedding_model,
                exclude_column=PromptVersion.id,
            ),
        )
        super().__init__(db, storage, batch_size=batch_size)

    # ===== EntityEmbeddingService hooks =====

    async def _embed_entities(
        self, entities: Sequence[PromptVersion], *, model_id: str
    ) -> list[list[float]]:
        texts = [v.prompt_text for v in entities]
        result = await get_embedding_service().embed_texts(
            EmbedTextRequest(texts=texts, model_id=model_id)
        )
        return _validate_embeddings(
            result.vectors,
            expected_count=len(texts),
            expected_dimensions=EXPECTED_DIMENSIONS,
        )

    async def _embed_query(self, query: Any, *, model_id: str) -> list[float]:
        # Cache query vectors (deterministic per model+text). The default text
        # embedder (cmd:embedding-default) spawns a one-shot subprocess that
        # reloads the model each call (~15-25s), so re-embedding the same query
        # — which happens on every threshold/limit/family/rank refinement of a
        # similar search — would otherwise repeatedly hit that cost (and the
        # request timeout). See plan analyzer-preset-driven-embedder-config for
        # the persistent-daemon fix that removes the per-call load entirely.
        text = str(query)
        key = (model_id, text)
        cached = _QUERY_VECTOR_CACHE.get(key)
        if cached is not None:
            _QUERY_VECTOR_CACHE.move_to_end(key)
            return cached
        result = await get_embedding_service().embed_texts(
            EmbedTextRequest(texts=[text], model_id=model_id)
        )
        vector = _validate_embeddings(
            result.vectors,
            expected_count=1,
            expected_dimensions=EXPECTED_DIMENSIONS,
        )[0]
        _QUERY_VECTOR_CACHE[key] = vector
        _QUERY_VECTOR_CACHE.move_to_end(key)
        while len(_QUERY_VECTOR_CACHE) > _QUERY_VECTOR_CACHE_MAX:
            _QUERY_VECTOR_CACHE.popitem(last=False)
        return vector

    async def _resolve_model_id(self, model_id: str | None) -> str:
        if model_id:
            return model_id
        # get_default_model / FALLBACK_DEFAULTS return (model_id, method) tuples.
        try:
            resolved, _method = await get_default_model(self.db, AiModelCapability.EMBEDDING)
            return resolved
        except Exception:
            fallback, _method = FALLBACK_DEFAULTS.get(
                AiModelCapability.EMBEDDING, ("openai:text-embedding-3-small", None)
            )
            return fallback

    def _entity_filters(
        self,
        *,
        family_id: UUID | None = None,
        **_: Any,
    ) -> Sequence[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if family_id is not None:
            conditions.append(PromptVersion.family_id == family_id)
        return conditions

    def _keyset_columns(self) -> tuple[ColumnElement, ...]:
        return (PromptVersion.created_at, PromptVersion.id)

    # ===== loading + shaping =====

    async def _load_version(self, version_id: UUID) -> PromptVersion:
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        version = result.scalar_one_or_none()
        if not version:
            raise PromptVersionNotFoundError(f"Prompt version '{version_id}' not found")
        return version

    @staticmethod
    def _shape(result: SimilarityResult[PromptVersion]) -> dict:
        version = result.entity
        # Cosine distance → 0..1 similarity, matching the text-mode endpoint's
        # similarity_score field so both modes return the same shape.
        similarity = 1.0 - result.distance
        return {
            "version_id": str(version.id),
            "family_id": str(version.family_id) if version.family_id else None,
            "version_number": version.version_number,
            "prompt_text": version.prompt_text,
            "similarity_score": round(similarity, 4),
            "commit_message": version.commit_message,
            # Provenance signals so callers can show why a match ranks (and so
            # the hybrid re-rank is observable in the UI).
            "successful_assets": version.successful_assets,
            "generation_count": version.generation_count,
        }

    # ===== public facade =====

    async def embed_version(
        self,
        version: UUID | PromptVersion,
        model_id: str | None = None,
        force: bool = False,
    ) -> PromptVersion:
        """Embed a single prompt version (by UUID or loaded entity)."""
        entity = version if isinstance(version, PromptVersion) else await self._load_version(version)
        await self.embed_one(entity, model_id=model_id, force=force)
        await self.db.refresh(entity)
        logger.info("Embedded prompt version %s", entity.id)
        return entity

    async def embed_versions_batch(
        self,
        model_id: str | None = None,
        force: bool = False,
        family_id: UUID | None = None,
    ) -> dict:
        """Batch-embed prompt versions that need embeddings. Returns a stats dict."""
        stats = await self.embed_batch(
            model_id=model_id,
            force=force,
            family_id=family_id,
        )
        return {
            "embedded_count": stats.embedded_count,
            "skipped_count": stats.skipped_count,
            "total": stats.total,
            "model_id": stats.model_id,
        }

    async def find_similar(
        self,
        version_id: UUID,
        *,
        family_id: UUID | None = None,
        limit: int = 10,
        min_similarity: float | None = None,
    ) -> list[dict]:
        """Find prompt versions similar to a given version."""
        source = await self._load_version(version_id)
        try:
            results = await super().find_similar(
                source,
                family_id=family_id,
                limit=limit,
                threshold=_distance_threshold(min_similarity),
            )
        except EntityNotEmbeddedError as exc:
            raise PromptVersionNotEmbeddedError(
                f"Prompt version '{version_id}' has no embedding. Embed it first."
            ) from exc
        return [self._shape(r) for r in results]

    async def find_similar_by_text(
        self,
        text: str,
        *,
        model_id: str | None = None,
        family_id: UUID | None = None,
        limit: int = 10,
        min_similarity: float | None = None,
        rank: str = "similarity",
    ) -> list[dict]:
        """Find prompt versions similar to arbitrary text.

        rank:
            - "similarity" (default): pure semantic nearest-neighbor order.
            - "hybrid": re-rank an over-fetched candidate pool by a blend of
              semantic similarity and a saturating successful_assets boost, so
              prompts that have actually produced good generations surface first
              among comparably-similar matches.
        """
        hybrid = rank == "hybrid"
        # Over-fetch when re-ranking so the boost can pull a proven-but-slightly-
        # less-similar prompt above a closer one that never produced anything.
        fetch_limit = (
            min(_HYBRID_MAX_CANDIDATES, max(limit, limit * _HYBRID_OVERFETCH))
            if hybrid
            else limit
        )
        results = await self.find_similar_by_query(
            text,
            model_id=model_id,
            family_id=family_id,
            limit=fetch_limit,
            threshold=_distance_threshold(min_similarity),
        )
        if hybrid:
            results = sorted(
                results,
                key=lambda r: _hybrid_score(r.distance, r.entity.successful_assets),
                reverse=True,
            )[:limit]
        return [self._shape(r) for r in results]


def _success_boost(successful_assets: int) -> float:
    """Map a successful_assets count to a [0, 1] boost, saturating so a high-
    volume prompt doesn't dominate purely on count."""
    if successful_assets <= 0:
        return 0.0
    return min(1.0, math.log1p(successful_assets) / math.log1p(_HYBRID_SUCCESS_SATURATION))


def _hybrid_score(distance: float, successful_assets: int) -> float:
    """Blend semantic similarity (1 - cosine distance) with the success boost.
    Similarity carries (1 - weight); the boost carries weight."""
    similarity = 1.0 - distance
    boost = _success_boost(successful_assets)
    return (1.0 - _HYBRID_SUCCESS_WEIGHT) * similarity + _HYBRID_SUCCESS_WEIGHT * boost


def _distance_threshold(min_similarity: float | None) -> float | None:
    """Convert a minimum cosine *similarity* (0..1, endpoint semantics) into the
    maximum cosine *distance* the generic similarity filter expects."""
    if min_similarity is None:
        return None
    return 1.0 - min_similarity
