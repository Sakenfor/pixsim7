"""
Block embedding service — thin BlockPrimitive subclass of the generic
EntityEmbeddingService.

Public facade (unchanged API):
- embed_block: embed a single block primitive (by UUID PK or canonical block_id)
- embed_blocks_batch: batch-embed blocks that need it
- find_similar: find blocks similar to a given block
- find_similar_by_text: find blocks similar to arbitrary text

All the orchestration (batch keyset loop, similarity query, commit boundaries,
skip-if-cached) lives in EntityEmbeddingService. Vector storage is delegated to
PerRowStorage over BlockPrimitive's embedding columns. Raw text→vector goes
through the bound EmbeddingService (locator) — this service no longer touches
the provider registry directly (keeps the locator the single door; see plan
embedding-service-generalization, option-1 guardrail).
"""
import logging
from typing import Any, Optional, Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.blocks import BlockPrimitive
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

# Verb-layer validation now lives in the sibling package (hostless, dim-parametric).
# Re-exported below with a 768 default to preserve this module's public API.
from pixsim7.embedding.validation import EmbeddingDimensionError
from pixsim7.embedding.validation import validate_embeddings as _validate_embeddings
from pixsim7.embedding.locator import get_embedding_service
from pixsim7.embedding.protocol import EmbedTextRequest

logger = logging.getLogger(__name__)

BATCH_SIZE = 64
EXPECTED_DIMENSIONS = 768

# Public surface. EmbeddingDimensionError is re-exported from the sibling for
# back-compat with existing importers / catch sites.
__all__ = [
    "BlockEmbeddingService",
    "EmbeddingService",
    "EmbeddingModelError",
    "BlockNotFoundError",
    "BlockNotEmbeddedError",
    "EmbeddingDimensionError",
    "validate_embeddings",
    "EXPECTED_DIMENSIONS",
    "BATCH_SIZE",
]


# ===== Domain errors raised by BlockEmbeddingService =====

class EmbeddingModelError(ValueError):
    """Unknown or misconfigured embedding model/provider (maps to 400)."""


class BlockNotFoundError(LookupError):
    """Block not found in database (maps to 404)."""


class BlockNotEmbeddedError(Exception):
    """Block exists but has no embedding yet (maps to 422)."""


# ===== Validation helper =====
# Thin binding over the sibling's dim-parametric validator, defaulting to the
# block embedding dimension (768). EmbeddingDimensionError is the sibling's
# class, re-exported for back-compat with existing importers / catch sites.

def validate_embeddings(
    embeddings: list,
    expected_count: int,
    expected_dimensions: int = EXPECTED_DIMENSIONS,
) -> list[list[float]]:
    """Validate embedding output (count, list[float]-compatible, dims, finite).

    Raises EmbeddingDimensionError on any validation failure.
    """
    return _validate_embeddings(
        embeddings, expected_count, expected_dimensions=expected_dimensions
    )


def _tag_value(tags: Optional[dict], key: str) -> Optional[str]:
    if not isinstance(tags, dict):
        return None
    value = tags.get(key)
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return None


def _build_embed_text(block: BlockPrimitive) -> str:
    """Build the text to embed for a block primitive.

    Combines role/category hints plus block text for richer semantic signal.
    """
    parts: list[str] = []
    role = _tag_value(block.tags, "role")
    description = _tag_value(block.tags, "description")
    if role:
        parts.append(f"[{role}]")
    if block.category:
        parts.append(f"({block.category})")
    if description:
        parts.append(description)
    parts.append(block.text)
    return " ".join(parts)


class BlockEmbeddingService(EntityEmbeddingService[BlockPrimitive]):
    """Embedding generation + similarity search for block primitives."""

    def __init__(self, db: AsyncSession):
        storage = PerRowStorage(
            db,
            PerRowColumns(
                vector=BlockPrimitive.embedding,
                model=BlockPrimitive.embedding_model,
                exclude_column=BlockPrimitive.block_id,
            ),
        )
        super().__init__(db, storage, batch_size=BATCH_SIZE)

    # ===== EntityEmbeddingService hooks =====

    async def _embed_entities(
        self, entities: Sequence[BlockPrimitive], *, model_id: str
    ) -> list[list[float]]:
        texts = [_build_embed_text(b) for b in entities]
        result = await get_embedding_service().embed_texts(
            EmbedTextRequest(
                texts=texts,
                model_id=model_id,
                caller="service:block_embedding:batch",
                context={"entity_count": str(len(texts))},
            )
        )
        # Re-validate at the block's column dimension (768). The composite
        # already validated against the provider's dims; this guards against a
        # misconfigured provider whose vectors wouldn't fit BlockPrimitive.embedding.
        return validate_embeddings(result.vectors, expected_count=len(texts))

    async def _embed_query(self, query: Any, *, model_id: str) -> list[float]:
        result = await get_embedding_service().embed_texts(
            EmbedTextRequest(
                texts=[query],
                model_id=model_id,
                caller="service:block_embedding:query",
                context={"query_count": "1"},
            )
        )
        return validate_embeddings(result.vectors, expected_count=1)[0]

    async def _resolve_model_id(self, model_id: str | None) -> str:
        if model_id:
            return model_id
        try:
            return await get_default_model(self.db, AiModelCapability.EMBEDDING)
        except Exception:
            return FALLBACK_DEFAULTS.get(
                AiModelCapability.EMBEDDING, "openai:text-embedding-3-small"
            )

    def _entity_filters(
        self,
        *,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
        **_: Any,
    ) -> Sequence[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if role:
            conditions.append(
                func.jsonb_extract_path_text(BlockPrimitive.tags, "role") == role
            )
        if kind:
            conditions.append(
                func.jsonb_extract_path_text(BlockPrimitive.tags, "kind") == kind
            )
        if category:
            conditions.append(BlockPrimitive.category == category)
        return conditions

    def _keyset_columns(self) -> tuple[ColumnElement, ...]:
        return (BlockPrimitive.created_at, BlockPrimitive.id)

    # ===== block_id ref resolution =====

    @staticmethod
    def _block_lookup_filter(block_ref: UUID | str):
        """Build lookup predicate from UUID PK or canonical string block_id.

        Accepts UUID objects and UUID-like strings for compatibility.
        """
        if isinstance(block_ref, UUID):
            return BlockPrimitive.id == block_ref

        value = str(block_ref).strip()
        if not value:
            return BlockPrimitive.block_id == value

        try:
            parsed_uuid = UUID(value)
        except ValueError:
            return BlockPrimitive.block_id == value

        return or_(BlockPrimitive.block_id == value, BlockPrimitive.id == parsed_uuid)

    async def _load_block(self, block_ref: UUID | str) -> BlockPrimitive:
        result = await self.db.execute(
            select(BlockPrimitive).where(self._block_lookup_filter(block_ref))
        )
        block = result.scalar_one_or_none()
        if not block:
            raise BlockNotFoundError(f"Block '{block_ref}' not found")
        return block

    @staticmethod
    def _shape(result: SimilarityResult[BlockPrimitive]) -> dict:
        return {
            "block": result.entity,
            "distance": result.distance,
            "similarity_score": result.similarity_score,
        }

    # ===== public facade (back-compat API) =====

    async def embed_block(
        self,
        block_id: UUID | str,
        model_id: str | None = None,
        force: bool = False,
    ) -> BlockPrimitive:
        """Embed a single block (by UUID PK or canonical block_id)."""
        block = await self._load_block(block_id)
        await self.embed_one(block, model_id=model_id, force=force)
        await self.db.refresh(block)
        logger.info("Embedded block %s", block.block_id)
        return block

    async def embed_blocks_batch(
        self,
        model_id: str | None = None,
        force: bool = False,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
    ) -> dict:
        """Batch-embed blocks that need embeddings. Returns a stats dict."""
        stats = await self.embed_batch(
            model_id=model_id,
            force=force,
            role=role,
            kind=kind,
            category=category,
        )
        return {
            "embedded_count": stats.embedded_count,
            "skipped_count": stats.skipped_count,
            "total": stats.total,
            "model_id": stats.model_id,
        }

    async def find_similar(
        self,
        block_id: UUID | str,
        *,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
        limit: int = 10,
        threshold: float | None = None,
    ) -> list[dict]:
        """Find blocks similar to a given block."""
        source = await self._load_block(block_id)
        # Default to the source block's role for broad filtering when available.
        if role is None:
            role = _tag_value(source.tags, "role")
        try:
            results = await super().find_similar(
                source,
                role=role,
                kind=kind,
                category=category,
                limit=limit,
                threshold=threshold,
            )
        except EntityNotEmbeddedError as exc:
            raise BlockNotEmbeddedError(
                f"Block '{block_id}' has no embedding. "
                f"Embed it first via POST /{block_id}/embed"
            ) from exc
        return [self._shape(r) for r in results]

    async def find_similar_by_text(
        self,
        text: str,
        *,
        model_id: str | None = None,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
        limit: int = 10,
        threshold: float | None = None,
    ) -> list[dict]:
        """Find blocks similar to arbitrary text."""
        results = await self.find_similar_by_query(
            text,
            model_id=model_id,
            role=role,
            kind=kind,
            category=category,
            limit=limit,
            threshold=threshold,
        )
        return [self._shape(r) for r in results]


# Back-compat alias: the class was historically exported as `EmbeddingService`.
EmbeddingService = BlockEmbeddingService
