"""
Tests for EmbeddingService

Focused tests for error semantics, dimension validation, and batch resilience.
All tests are pure-unit: no database, no real providers — everything is mocked.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

try:
    from pixsim7.backend.main.services.embedding.embedding_service import (
        EmbeddingService,
        BlockNotFoundError,
        BlockNotEmbeddedError,
        EmbeddingModelError,
        EmbeddingDimensionError,
        validate_embeddings,
        EXPECTED_DIMENSIONS,
        _build_embed_text,
    )
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ===== Helpers =====

def _make_block(**overrides):
    """Create a minimal mock PromptBlock."""
    block = MagicMock()
    block.id = overrides.get("id", uuid4())
    block.block_id = overrides.get("block_id", "test_block")
    block.role = overrides.get("role", "character")
    block.category = overrides.get("category", None)
    block.description = overrides.get("description", None)
    block.text = overrides.get("text", "A woman sitting on a bench")
    block.embedding = overrides.get("embedding", None)
    block.embedding_model = overrides.get("embedding_model", None)
    block.created_at = overrides.get("created_at", None)
    block.kind = overrides.get("kind", "single_state")
    return block


def _good_embedding(dims=EXPECTED_DIMENSIONS):
    """Return a valid embedding vector of the expected length."""
    return [0.01] * dims


def _make_scalar_result(block):
    """Create a mock for db.execute(...).scalar_one_or_none().

    SQLAlchemy's Result.scalar_one_or_none() is synchronous, so we use
    a plain MagicMock for the result object — only db.execute() is async.
    """
    result = MagicMock()
    result.scalar_one_or_none.return_value = block
    return result


# ===== validate_embeddings =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestValidateEmbeddings:

    def test_correct_dimensions_pass(self):
        embs = [_good_embedding()]
        assert validate_embeddings(embs, expected_count=1) == embs

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

        service = EmbeddingService(db)
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

        service = EmbeddingService(db)
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

        fake_provider = AsyncMock()
        # Provider returns a 512-dim vector instead of 768
        fake_provider.embed_texts.return_value = [[0.01] * 512]

        service = EmbeddingService(db)

        with patch.object(service, '_resolve_model_id', return_value="openai:text-embedding-3-small"), \
             patch.object(service, '_get_provider', return_value=fake_provider):
            with pytest.raises(EmbeddingDimensionError, match="512 dimensions"):
                await service.embed_block(block.id)

        # Verify commit was NOT called (bad vector should never be persisted)
        db.commit.assert_not_called()


# ===== Batch mode: continues after one failed batch, reports skipped =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestBatchEmbeddingResilience:

    @pytest.mark.asyncio
    async def test_batch_continues_after_failure(self):
        """
        Simulate two DB chunks:
        - Chunk 1: provider returns wrong-dim vectors -> skipped
        - Chunk 2: provider returns correct vectors -> embedded
        """
        block_a = _make_block(id=uuid4(), block_id="block_a", embedding=None)
        block_b = _make_block(id=uuid4(), block_id="block_b", embedding=None)

        db = AsyncMock()
        # Call sequence for execute():
        # 1. count query -> returns 2
        # 2. first chunk query -> returns [block_a]
        # 3. second chunk query -> returns [block_b]
        # 4. third chunk query -> returns [] (end)
        count_result = MagicMock()
        count_result.scalar.return_value = 2

        chunk1_result = MagicMock()
        chunk1_result.scalars.return_value.all.return_value = [block_a]

        chunk2_result = MagicMock()
        chunk2_result.scalars.return_value.all.return_value = [block_b]

        empty_result = MagicMock()
        empty_result.scalars.return_value.all.return_value = []

        db.execute = AsyncMock(
            side_effect=[count_result, chunk1_result, chunk2_result, empty_result]
        )
        db.commit = AsyncMock()
        db.rollback = AsyncMock()

        fake_provider = AsyncMock()
        # First call: wrong dims (chunk 1 fails validation)
        # Second call: correct dims (chunk 2 succeeds)
        fake_provider.embed_texts = AsyncMock(side_effect=[
            [[0.01] * 512],       # bad dims
            [_good_embedding()],  # good dims
        ])

        service = EmbeddingService(db)

        with patch.object(service, '_resolve_model_id', return_value="openai:text-embedding-3-small"), \
             patch.object(service, '_get_provider', return_value=fake_provider):
            stats = await service.embed_blocks_batch()

        assert stats["skipped_count"] == 1
        assert stats["embedded_count"] == 1
        assert stats["total"] == 2
        # rollback called once for the failed batch
        db.rollback.assert_called_once()
        # commit called once for the successful batch
        assert db.commit.call_count == 1


# ===== EmbeddingModelError for unknown model =====

@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestEmbeddingModelError:

    def test_unknown_model_raises(self):
        db = AsyncMock()
        service = EmbeddingService(db)

        with patch(
            'pixsim7.backend.main.services.embedding.embedding_service.ai_model_registry'
        ) as mock_reg:
            mock_reg.get.return_value = None
            with pytest.raises(EmbeddingModelError, match="not found"):
                service._get_provider("nonexistent:model")
