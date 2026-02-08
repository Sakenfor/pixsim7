"""
Embedding Service - vector embeddings for semantic similarity search

Provides:
- EmbeddingProvider protocol and registry for pluggable embedding providers
- EmbeddingService for embedding prompt blocks and similarity search
- OpenAI and Command-based embedding adapters
"""

from pixsim7.backend.main.services.embedding.registry import (
    EmbeddingProvider,
    EmbeddingProviderRegistry,
    embedding_registry,
)
from pixsim7.backend.main.services.embedding.embedding_service import EmbeddingService

__all__ = [
    "EmbeddingProvider",
    "EmbeddingProviderRegistry",
    "embedding_registry",
    "EmbeddingService",
]
