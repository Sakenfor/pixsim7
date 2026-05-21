"""
Vector validation — hostless helper shared by every embedding consumer.

Moved here from backend services/embedding so both the daemon path (images)
and the text-provider path validate identically, with no backend imports.
Dimension expectation is a parameter (768 for text-embedding-3-*, 1024 for
SigLIP-2), not a module constant — different consumers embed into different
spaces.
"""
from __future__ import annotations

import math


class EmbeddingDimensionError(ValueError):
    """Embedding vector has wrong count, type, dims, or non-finite values."""


def validate_embeddings(
    embeddings: object,
    expected_count: int,
    *,
    expected_dimensions: int,
) -> list[list[float]]:
    """Validate provider output: correct count, list[float]-compatible,
    correct dims, all-finite. Returns the normalized list[list[float]].

    Raises EmbeddingDimensionError on any failure.
    """
    if not isinstance(embeddings, (list, tuple)):
        raise EmbeddingDimensionError(
            f"Embeddings payload is {type(embeddings).__name__}, expected list"
        )
    if len(embeddings) != expected_count:
        raise EmbeddingDimensionError(
            f"Expected {expected_count} embeddings, got {len(embeddings)}"
        )

    normalized_embeddings: list[list[float]] = []
    for i, emb in enumerate(embeddings):
        if not isinstance(emb, (list, tuple)):
            raise EmbeddingDimensionError(
                f"Embedding [{i}] is {type(emb).__name__}, expected list[float]"
            )
        if len(emb) != expected_dimensions:
            raise EmbeddingDimensionError(
                f"Embedding [{i}] has {len(emb)} dimensions, expected {expected_dimensions}"
            )
        normalized: list[float] = []
        for j, value in enumerate(emb):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise EmbeddingDimensionError(
                    f"Embedding [{i}][{j}] is {type(value).__name__}, expected finite number"
                )
            as_float = float(value)
            if not math.isfinite(as_float):
                raise EmbeddingDimensionError(
                    f"Embedding [{i}][{j}] is non-finite ({as_float})"
                )
            normalized.append(as_float)
        normalized_embeddings.append(normalized)
    return normalized_embeddings
