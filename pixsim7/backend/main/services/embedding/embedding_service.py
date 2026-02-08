"""
Embedding Service - orchestrates block embedding and similarity search.

Provides:
- embed_block: Embed a single prompt block
- embed_blocks_batch: Batch embed blocks that need it
- find_similar: Find blocks similar to a given block
- find_similar_by_text: Find blocks similar to arbitrary text
"""
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.embedding.registry import embedding_registry
from pixsim7.backend.main.services.ai_model.registry import ai_model_registry
from pixsim7.backend.main.services.ai_model.defaults import (
    get_default_model,
    FALLBACK_DEFAULTS,
)
from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability
from pixsim7.backend.main.shared.errors import ProviderNotFoundError

logger = logging.getLogger(__name__)

BATCH_SIZE = 64
EXPECTED_DIMENSIONS = 768


# ===== Domain errors raised by EmbeddingService =====

class EmbeddingModelError(ValueError):
    """Unknown or misconfigured embedding model/provider (maps to 400)."""


class BlockNotFoundError(LookupError):
    """Block not found in database (maps to 404)."""


class BlockNotEmbeddedError(Exception):
    """Block exists but has no embedding yet (maps to 422)."""


class EmbeddingDimensionError(ValueError):
    """Embedding vector has wrong dimensions (maps to 500 / skipped in batch)."""


# ===== Validation helper =====

def validate_embeddings(embeddings: list, expected_count: int) -> list[list[float]]:
    """
    Validate embedding output: correct count, list[float]-compatible, correct dims.

    Raises EmbeddingDimensionError on any validation failure.
    """
    if len(embeddings) != expected_count:
        raise EmbeddingDimensionError(
            f"Expected {expected_count} embeddings, got {len(embeddings)}"
        )
    for i, emb in enumerate(embeddings):
        if not isinstance(emb, (list, tuple)):
            raise EmbeddingDimensionError(
                f"Embedding [{i}] is {type(emb).__name__}, expected list[float]"
            )
        if len(emb) != EXPECTED_DIMENSIONS:
            raise EmbeddingDimensionError(
                f"Embedding [{i}] has {len(emb)} dimensions, expected {EXPECTED_DIMENSIONS}"
            )
    return embeddings


def _build_embed_text(block: PromptBlock) -> str:
    """
    Build the text to embed for a block.

    Combines role, category, description, and prompt text for richer semantic signal.
    """
    parts: list[str] = []
    if block.role:
        parts.append(f"[{block.role}]")
    if block.category:
        parts.append(f"({block.category})")
    if block.description:
        parts.append(block.description)
    parts.append(block.text)
    return " ".join(parts)


class EmbeddingService:
    """Orchestrates embedding generation and similarity search for prompt blocks."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _resolve_model_id(self, model_id: str | None = None) -> str:
        """Resolve model_id: explicit > db default > fallback."""
        if model_id:
            return model_id
        try:
            return await get_default_model(self.db, AiModelCapability.EMBEDDING)
        except Exception:
            return FALLBACK_DEFAULTS.get(
                AiModelCapability.EMBEDDING, "openai:text-embedding-3-small"
            )

    def _get_provider(self, model_id: str):
        """
        Look up the embedding provider for a model_id.

        Raises EmbeddingModelError for unknown model or missing provider.
        """
        model = ai_model_registry.get(model_id)
        if not model:
            raise EmbeddingModelError(f"Model '{model_id}' not found in AI model registry")
        provider_id = model.provider_id
        if not provider_id:
            raise EmbeddingModelError(f"Model '{model_id}' has no provider_id")
        try:
            return embedding_registry.get(provider_id)
        except ProviderNotFoundError:
            raise EmbeddingModelError(
                f"Embedding provider '{provider_id}' for model '{model_id}' is not registered"
            )

    def _extract_bare_model(self, model_id: str) -> str:
        """Extract bare model name from prefixed ID (e.g., 'openai:text-embedding-3-small' -> 'text-embedding-3-small')."""
        if ":" in model_id:
            return model_id.split(":", 1)[1]
        return model_id

    async def embed_block(
        self,
        block_id: UUID,
        model_id: str | None = None,
        force: bool = False,
    ) -> PromptBlock:
        """
        Embed a single block.

        Args:
            block_id: Database UUID of the block
            model_id: Embedding model to use (defaults to system default)
            force: Re-embed even if already embedded with same model

        Returns:
            Updated block

        Raises:
            BlockNotFoundError: Block not found
            EmbeddingModelError: Unknown model/provider
            EmbeddingDimensionError: Provider returned wrong-dimension vectors
        """
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.id == block_id)
        )
        block = result.scalar_one_or_none()
        if not block:
            raise BlockNotFoundError(f"Block '{block_id}' not found")

        model_id = await self._resolve_model_id(model_id)

        if not force and block.embedding is not None and block.embedding_model == model_id:
            logger.debug("Block %s already embedded with %s, skipping", block_id, model_id)
            return block

        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)
        text = _build_embed_text(block)

        embeddings = await provider.embed_texts(model_id=bare_model, texts=[text])
        validate_embeddings(embeddings, expected_count=1)

        block.embedding = embeddings[0]
        block.embedding_model = model_id

        await self.db.commit()
        await self.db.refresh(block)

        logger.info("Embedded block %s with model %s", block.block_id, model_id)
        return block

    async def embed_blocks_batch(
        self,
        model_id: str | None = None,
        force: bool = False,
        role: str | None = None,
        kind: str | None = None,
    ) -> dict:
        """
        Batch embed blocks that need embeddings.

        Uses keyset pagination to avoid loading all candidates into memory.
        Each DB chunk is embedded and committed independently; a failed chunk
        is rolled back and skipped without aborting the whole run.

        Args:
            model_id: Embedding model to use
            force: Re-embed all blocks regardless of current state
            role: Optional filter by role
            kind: Optional filter by kind

        Returns:
            Stats dict with embedded_count, skipped_count, total, model_id

        Raises:
            EmbeddingModelError: Unknown model/provider (fast-fail before any work)
        """
        model_id = await self._resolve_model_id(model_id)
        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)

        # Count total candidates up-front (cheap query)
        count_conditions = self._batch_conditions(model_id, force, role, kind)
        count_q = select(func.count(PromptBlock.id))
        if count_conditions:
            count_q = count_q.where(and_(*count_conditions))
        total = (await self.db.execute(count_q)).scalar() or 0

        embedded_count = 0
        skipped_count = 0
        last_created_at = None
        last_id = None

        while True:
            # Keyset pagination: fetch next chunk
            conditions = self._batch_conditions(model_id, force, role, kind)
            if last_created_at is not None and last_id is not None:
                conditions.append(
                    (PromptBlock.created_at > last_created_at)
                    | (
                        (PromptBlock.created_at == last_created_at)
                        & (PromptBlock.id > last_id)
                    )
                )

            query = (
                select(PromptBlock)
                .where(and_(*conditions)) if conditions else select(PromptBlock)
            )
            query = query.order_by(PromptBlock.created_at, PromptBlock.id).limit(BATCH_SIZE)

            result = await self.db.execute(query)
            batch = list(result.scalars().all())
            if not batch:
                break

            # Advance keyset cursor
            last_created_at = batch[-1].created_at
            last_id = batch[-1].id

            texts = [_build_embed_text(b) for b in batch]

            try:
                embeddings = await provider.embed_texts(model_id=bare_model, texts=texts)
                validate_embeddings(embeddings, expected_count=len(batch))
            except Exception as e:
                logger.error("Batch embedding failed (cursor=%s): %s", last_id, e)
                skipped_count += len(batch)
                # Rollback any dirty state from this batch
                await self.db.rollback()
                continue

            for block, emb in zip(batch, embeddings):
                block.embedding = emb
                block.embedding_model = model_id
                embedded_count += 1

            await self.db.commit()
            logger.info("Embedded batch of %d blocks (cursor=%s)", len(batch), last_id)

        return {
            "embedded_count": embedded_count,
            "skipped_count": skipped_count,
            "total": total,
            "model_id": model_id,
        }

    @staticmethod
    def _batch_conditions(
        model_id: str, force: bool, role: str | None, kind: str | None
    ) -> list:
        conditions = []
        if not force:
            conditions.append(
                (PromptBlock.embedding.is_(None)) | (PromptBlock.embedding_model != model_id)
            )
        if role:
            conditions.append(PromptBlock.role == role)
        if kind:
            conditions.append(PromptBlock.kind == kind)
        return conditions

    async def find_similar(
        self,
        block_id: UUID,
        *,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
        limit: int = 10,
        threshold: float | None = None,
    ) -> list[dict]:
        """
        Find blocks similar to a given block.

        Raises:
            BlockNotFoundError: Block not found
            BlockNotEmbeddedError: Block exists but has no embedding
        """
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.id == block_id)
        )
        source_block = result.scalar_one_or_none()
        if not source_block:
            raise BlockNotFoundError(f"Block '{block_id}' not found")
        if source_block.embedding is None:
            raise BlockNotEmbeddedError(
                f"Block '{block_id}' has no embedding. Embed it first via POST /{block_id}/embed"
            )

        # Default to source block's role for broad filtering
        if role is None:
            role = source_block.role

        return await self._similarity_query(
            query_embedding=source_block.embedding,
            embedding_model=source_block.embedding_model,
            exclude_id=block_id,
            role=role,
            kind=kind,
            category=category,
            limit=limit,
            threshold=threshold,
        )

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
        """
        Find blocks similar to arbitrary text.

        Raises:
            EmbeddingModelError: Unknown model/provider
        """
        model_id = await self._resolve_model_id(model_id)
        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)

        embeddings = await provider.embed_texts(model_id=bare_model, texts=[text])
        validate_embeddings(embeddings, expected_count=1)
        query_embedding = embeddings[0]

        return await self._similarity_query(
            query_embedding=query_embedding,
            embedding_model=model_id,
            role=role,
            kind=kind,
            category=category,
            limit=limit,
            threshold=threshold,
        )

    async def _similarity_query(
        self,
        *,
        query_embedding: list[float],
        embedding_model: str | None,
        exclude_id: UUID | None = None,
        role: str | None = None,
        kind: str | None = None,
        category: str | None = None,
        limit: int = 10,
        threshold: float | None = None,
    ) -> list[dict]:
        """Run the actual similarity query with pre-filters."""
        conditions = [
            PromptBlock.embedding.isnot(None),
        ]

        if embedding_model:
            conditions.append(PromptBlock.embedding_model == embedding_model)
        if role:
            conditions.append(PromptBlock.role == role)
        if kind:
            conditions.append(PromptBlock.kind == kind)
        if category:
            conditions.append(PromptBlock.category == category)
        if exclude_id:
            conditions.append(PromptBlock.id != exclude_id)

        distance_expr = PromptBlock.embedding.cosine_distance(query_embedding)

        query = (
            select(PromptBlock, distance_expr.label("distance"))
            .where(and_(*conditions))
            .order_by(distance_expr)
            .limit(limit)
        )

        result = await self.db.execute(query)
        rows = result.all()

        results = []
        for block, distance in rows:
            if threshold is not None and distance > threshold:
                continue
            results.append({
                "block": block,
                "distance": float(distance),
                "similarity_score": 1.0 - float(distance),
            })

        return results
