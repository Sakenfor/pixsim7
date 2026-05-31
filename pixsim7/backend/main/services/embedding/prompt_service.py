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
        result = await get_embedding_service().embed_texts(
            EmbedTextRequest(texts=[str(query)], model_id=model_id)
        )
        return _validate_embeddings(
            result.vectors,
            expected_count=1,
            expected_dimensions=EXPECTED_DIMENSIONS,
        )[0]

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
    ) -> list[dict]:
        """Find prompt versions similar to arbitrary text."""
        results = await self.find_similar_by_query(
            text,
            model_id=model_id,
            family_id=family_id,
            limit=limit,
            threshold=_distance_threshold(min_similarity),
        )
        return [self._shape(r) for r in results]


def _distance_threshold(min_similarity: float | None) -> float | None:
    """Convert a minimum cosine *similarity* (0..1, endpoint semantics) into the
    maximum cosine *distance* the generic similarity filter expects."""
    if min_similarity is None:
        return None
    return 1.0 - min_similarity
