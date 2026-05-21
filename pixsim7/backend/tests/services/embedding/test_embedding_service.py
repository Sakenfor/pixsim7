"""
Tests for BlockEmbeddingService.

Focused tests for error semantics, dimension validation, and batch resilience.
All tests are pure-unit: no database, no real providers. Raw text→vector now
goes through the bound EmbeddingService (locator), so tests override the
locator with a fake instead of patching a provider lookup.
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

try:
    from pixsim7.backend.main.services.embedding.embedding_service import (
        BlockEmbeddingService,
        BlockNotFoundError,
        BlockNotEmbeddedError,
        EmbeddingModelError,
        EmbeddingDimensionError,
        validate_embeddings,
        EXPECTED_DIMENSIONS,
    )
    from pixsim7.embedding.locator import locator as embedding_locator
    from pixsim7.embedding.protocol import EmbedResult
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False
    EXPECTED_DIMENSIONS = 768


# ===== Helpers =====

def _make_block(**overrides):
    """Create a minimal mock block."""
    block = MagicMock()
    block.id = overrides.get("id", uuid4())
    block.block_id = overrides.get("block_id", "test_block")
    block.tags = overrides.get("tags", {})
    block.category = overrides.get("category", None)
    block.text = overrides.get("text", "A woman sitting on a bench")
    block.embedding = overrides.get("embedding", None)
    block.embedding_model = overrides.get("embedding_model", None)
    # Real datetime: keyset pagination cursors on (created_at, id) and SQLAlchemy
    # rejects `> None`. Production blocks always have a created_at default.
    block.created_at = overrides.get(
        "created_at", datetime(2026, 1, 1, tzinfo=timezone.utc)
    )
    return block


def _good_embedding(dims=EXPECTED_DIMENSIONS):
    """Return a valid embedding vector of the expected length."""
    return [0.01] * dims


def _make_scalar_result(block):
    """Mock for db.execute(...).scalar_one_or_none()."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = block
    return result


def _embed_result(vectors, model_id="openai:text-embedding-3-small"):
    dim = len(vectors[0]) if vectors else 0
    return EmbedResult(vectors=vectors, dim=dim, model_id=model_id)


class _FakeEmbeddingService:
    """Stand-in for the bound EmbeddingService; only embed_texts is exercised."""

    def __init__(self, *, embed_texts):
        self._embed_texts = embed_texts

    async def embed_images(self, request):  # pragma: no cover - not used
        raise NotImplementedError

    async def embed_texts(self, request):
        return await self._embed_texts(request)

    async def shutdown(self):  # pragma: no cover - not used
        pass


def _scalars_returning(blocks):
    """Mock result whose .scalars().unique().all() yields `blocks`."""
    result = MagicMock()
    result.scalars.return_value.unique.return_value.all.return_value = blocks
    return result


# ===== validate_embeddings =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestValidateEmbeddings:

    def test_correct_dimensions_pass(self):
        embs = [_good_embedding()]
        assert validate_embeddings(embs, expected_count=1) == embs

    def test_int_values_are_normalized_to_float(self):
        embs = [[1] * EXPECTED_DIMENSIONS]
        validated = validate_embeddings(embs, expected_count=1)
        assert isinstance(validated[0][0], float)
        assert validated[0][0] == 1.0

    def test_wrong_count_raises(self):
        with pytest.raises(EmbeddingDimensionError, match="Expected 2.*got 1"):
            validate_embeddings([_good_embedding()], expected_count=2)

    def test_wrong_dimensions_raises(self):
        bad = [0.01] * 512
        with pytest.raises(EmbeddingDimensionError, match="512 dimensions.*expected 768"):
            validate_embeddings([bad], expected_count=1)

    def test_non_list_raises(self):
        with pytest.raises(EmbeddingDimensionError, match="str.*expected list"):
            validate_embeddings(["not-a-vector"], expected_count=1)

    def test_non_numeric_value_raises(self):
        bad = _good_embedding()
        bad[-1] = "x"
        with pytest.raises(EmbeddingDimensionError, match="expected finite number"):
            validate_embeddings([bad], expected_count=1)

    def test_non_finite_value_raises(self):
        bad = _good_embedding()
        bad[-1] = float("nan")
        with pytest.raises(EmbeddingDimensionError, match="non-finite"):
            validate_embeddings([bad], expected_count=1)

    def test_multiple_valid(self):
        embs = [_good_embedding(), _good_embedding()]
        assert validate_embeddings(embs, expected_count=2) == embs


# ===== find_similar: missing block -> BlockNotFoundError =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestFindSimilarMissingBlock:

    @pytest.mark.asyncio
    async def test_missing_block_raises_not_found(self):
        db = AsyncMock()
        db.execute.return_value = _make_scalar_result(None)

        service = BlockEmbeddingService(db)
        with pytest.raises(BlockNotFoundError):
            await service.find_similar(uuid4())


# ===== find_similar: block without embedding -> BlockNotEmbeddedError =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestFindSimilarNoEmbedding:

    @pytest.mark.asyncio
    async def test_block_without_embedding_raises_422(self):
        block = _make_block(embedding=None)
        db = AsyncMock()
        db.execute.return_value = _make_scalar_result(block)

        service = BlockEmbeddingService(db)
        with pytest.raises(BlockNotEmbeddedError, match="no embedding"):
            await service.find_similar(block.id)


# ===== embed_block: dimension validation rejects wrong-length vectors =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestEmbedBlockDimensionValidation:

    @pytest.mark.asyncio
    async def test_wrong_dimension_vector_rejected(self):
        block = _make_block(embedding=None)
        db = AsyncMock()
        db.execute.return_value = _make_scalar_result(block)

        # Bound service returns a 512-dim vector instead of 768.
        fake = _FakeEmbeddingService(
            embed_texts=AsyncMock(return_value=_embed_result([[0.01] * 512]))
        )

        service = BlockEmbeddingService(db)
        with patch.object(service, "_resolve_model_id",
                          AsyncMock(return_value="openai:text-embedding-3-small")), \
                embedding_locator.override(fake):
            with pytest.raises(EmbeddingDimensionError, match="512 dimensions"):
                await service.embed_block(block.id)

        # Bad vector must never be persisted.
        db.commit.assert_not_called()


# ===== Batch mode: continues after one failed batch, reports skipped =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestBatchEmbeddingResilience:

    @pytest.mark.asyncio
    async def test_batch_continues_after_failure(self):
        """
        Two DB chunks:
        - Chunk 1: bound service returns wrong-dim vectors -> skipped
        - Chunk 2: correct vectors -> embedded
        """
        block_a = _make_block(id=uuid4(), block_id="block_a", embedding=None)
        block_b = _make_block(id=uuid4(), block_id="block_b", embedding=None)

        db = AsyncMock()
        count_result = MagicMock()
        count_result.scalar.return_value = 2

        db.execute = AsyncMock(side_effect=[
            count_result,                       # count query
            _scalars_returning([block_a]),      # chunk 1
            _scalars_returning([block_b]),      # chunk 2
            _scalars_returning([]),             # end
        ])
        db.commit = AsyncMock()
        db.rollback = AsyncMock()

        # First embed call: bad dims (chunk 1 fails); second: good dims.
        fake = _FakeEmbeddingService(embed_texts=AsyncMock(side_effect=[
            _embed_result([[0.01] * 512]),
            _embed_result([_good_embedding()]),
        ]))

        service = BlockEmbeddingService(db)
        with patch.object(service, "_resolve_model_id",
                          AsyncMock(return_value="openai:text-embedding-3-small")), \
                embedding_locator.override(fake):
            stats = await service.embed_blocks_batch()

        assert stats["skipped_count"] == 1
        assert stats["embedded_count"] == 1
        assert stats["total"] == 2
        db.rollback.assert_called_once()
        assert db.commit.call_count == 1


# ===== Batch mode: commit failure should fail-fast =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestBatchEmbeddingCommitFailure:

    @pytest.mark.asyncio
    async def test_commit_failure_raises_and_rolls_back(self):
        block = _make_block(id=uuid4(), block_id="block_a", embedding=None)

        db = AsyncMock()
        count_result = MagicMock()
        count_result.scalar.return_value = 1

        db.execute = AsyncMock(side_effect=[
            count_result,
            _scalars_returning([block]),
        ])
        db.commit = AsyncMock(side_effect=RuntimeError("commit failed"))
        db.rollback = AsyncMock()

        fake = _FakeEmbeddingService(
            embed_texts=AsyncMock(return_value=_embed_result([_good_embedding()]))
        )

        service = BlockEmbeddingService(db)
        with patch.object(service, "_resolve_model_id",
                          AsyncMock(return_value="openai:text-embedding-3-small")), \
                embedding_locator.override(fake):
            with pytest.raises(RuntimeError, match="commit failed"):
                await service.embed_blocks_batch()

        db.rollback.assert_called_once()


# ===== Composite resolves provider; unknown model raises =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCompositeProviderResolution:
    """Model→provider resolution moved from the block service to the bound
    composite. This is the option-1 guardrail: the block service no longer
    touches the provider registry directly."""

    def test_unknown_model_raises(self):
        from pixsim7.backend.main.adapters.embedding import CompositeEmbeddingService

        with patch(
            "pixsim7.backend.main.adapters.embedding.ai_model_registry"
        ) as mock_reg:
            mock_reg.get.return_value = None
            with pytest.raises(EmbeddingModelError, match="not found"):
                CompositeEmbeddingService._resolve_text_provider("nonexistent:model")
