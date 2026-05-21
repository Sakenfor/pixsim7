"""Storage abstraction for the generic entity embedding service.

See `base.py` for the protocol; `per_row.py` and `multi_vector.py` for the
two flavours used by blocks/prompts vs. assets respectively.
"""
from .base import EmbeddingStorage, SimilarityResult, StoredEmbedding
from .multi_vector import MultiVectorTable, MultiVectorTableStorage
from .per_row import PerRowColumns, PerRowStorage

__all__ = [
    "EmbeddingStorage",
    "MultiVectorTable",
    "MultiVectorTableStorage",
    "PerRowColumns",
    "PerRowStorage",
    "SimilarityResult",
    "StoredEmbedding",
]
