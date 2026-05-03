"""
EmbeddingService protocol — the only thing backend (and any future consumer)
talks to. All exchange shapes are frozen DTOs so a Phase-2 split to a separate
process or service stays reachable without touching call sites.

Design invariants:
- Every method is async (HTTP-ready for a future service split).
- Inputs and outputs are frozen dataclasses; no SQLModel rows, no ORM objects.
- Methods are coarse — one call processes a batch of paths.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, Sequence


@dataclass(frozen=True, slots=True)
class EmbedRequest:
    """Image paths to embed.

    `paths` are absolute paths the embedder can read directly.
    """

    paths: Sequence[str]


@dataclass(frozen=True, slots=True)
class EmbedResult:
    """One vector per input path, in input order.

    `dim` is implied by len(vectors[i]); kept on the result so callers can
    sanity-check before persisting. `model_id` is the model identifier the
    embedder used (for provenance on the stored row).
    """

    vectors: list[list[float]]
    dim: int
    model_id: str


class EmbeddingService(Protocol):
    """Image-embedding capability.

    Implementations must be safe to call concurrently from async code; they
    serialize internally if the underlying inference is single-threaded.
    """

    async def embed_images(self, request: EmbedRequest) -> EmbedResult:
        """Embed each path in `request.paths`. Returns vectors in input order.

        Raises:
            EmbeddingServiceError: if the service is unreachable or the
                inference subprocess returned a non-recoverable error.
        """
        ...

    async def shutdown(self) -> None:
        """Release any resources (subprocess, GPU memory). Idempotent."""
        ...


class EmbeddingServiceError(Exception):
    """Raised when the embedding service cannot fulfil a request."""
