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
from sqlalchemy import select, and_

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.embedding.registry import embedding_registry
from pixsim7.backend.main.services.ai_model.registry import ai_model_registry
from pixsim7.backend.main.services.ai_model.defaults import (
    get_default_model,
    FALLBACK_DEFAULTS,
)
from pixsim7.backend.main.shared.schemas.ai_model_schemas import AiModelCapability

logger = logging.getLogger(__name__)

BATCH_SIZE = 64


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
        """Look up the embedding provider for a model_id."""
        model = ai_model_registry.get(model_id)
        if not model:
            raise ValueError(f"Model '{model_id}' not found in AI model registry")
        provider_id = model.provider_id
        if not provider_id:
            raise ValueError(f"Model '{model_id}' has no provider_id")
        return embedding_registry.get(provider_id)

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
    ) -> PromptBlock | None:
        """
        Embed a single block.

        Args:
            block_id: Database UUID of the block
            model_id: Embedding model to use (defaults to system default)
            force: Re-embed even if already embedded with same model

        Returns:
            Updated block, or None if not found
        """
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.id == block_id)
        )
        block = result.scalar_one_or_none()
        if not block:
            return None

        model_id = await self._resolve_model_id(model_id)

        if not force and block.embedding is not None and block.embedding_model == model_id:
            logger.debug("Block %s already embedded with %s, skipping", block_id, model_id)
            return block

        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)
        text = _build_embed_text(block)

        embeddings = await provider.embed_texts(model_id=bare_model, texts=[text])
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

        Args:
            model_id: Embedding model to use
            force: Re-embed all blocks regardless of current state
            role: Optional filter by role
            kind: Optional filter by kind

        Returns:
            Stats dict with embedded_count, skipped_count, total
        """
        model_id = await self._resolve_model_id(model_id)
        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)

        # Build filter for blocks that need embedding
        conditions = []
        if not force:
            conditions.append(
                (PromptBlock.embedding.is_(None)) | (PromptBlock.embedding_model != model_id)
            )
        if role:
            conditions.append(PromptBlock.role == role)
        if kind:
            conditions.append(PromptBlock.kind == kind)

        query = select(PromptBlock)
        if conditions:
            query = query.where(and_(*conditions))
        query = query.order_by(PromptBlock.created_at)

        result = await self.db.execute(query)
        blocks = list(result.scalars().all())

        embedded_count = 0
        skipped_count = 0

        # Process in batches
        for i in range(0, len(blocks), BATCH_SIZE):
            batch = blocks[i : i + BATCH_SIZE]
            texts = [_build_embed_text(b) for b in batch]

            try:
                embeddings = await provider.embed_texts(model_id=bare_model, texts=texts)
            except Exception as e:
                logger.error("Batch embedding failed at offset %d: %s", i, e)
                skipped_count += len(batch)
                continue

            for block, emb in zip(batch, embeddings):
                block.embedding = emb
                block.embedding_model = model_id
                embedded_count += 1

            await self.db.commit()
            logger.info(
                "Embedded batch %d-%d (%d blocks)",
                i, i + len(batch), len(batch),
            )

        return {
            "embedded_count": embedded_count,
            "skipped_count": skipped_count,
            "total": len(blocks),
            "model_id": model_id,
        }

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

        Args:
            block_id: Source block UUID
            role: Filter by role (defaults to source block's role)
            kind: Optional filter by kind
            category: Optional filter by category
            limit: Max results
            threshold: Max cosine distance (lower = more similar)

        Returns:
            List of dicts with block, distance, similarity_score
        """
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.id == block_id)
        )
        source_block = result.scalar_one_or_none()
        if not source_block or source_block.embedding is None:
            return []

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

        Args:
            text: Text to find similar blocks for
            model_id: Embedding model to use
            role: Optional role filter
            kind: Optional kind filter
            category: Optional category filter
            limit: Max results
            threshold: Max cosine distance

        Returns:
            List of dicts with block, distance, similarity_score
        """
        model_id = await self._resolve_model_id(model_id)
        provider = self._get_provider(model_id)
        bare_model = self._extract_bare_model(model_id)

        embeddings = await provider.embed_texts(model_id=bare_model, texts=[text])
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
