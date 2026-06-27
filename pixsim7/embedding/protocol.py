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

from dataclasses import dataclass
from typing import Mapping, Protocol, Sequence


@dataclass(frozen=True, slots=True)
class EmbedRequest:
    """Image paths to embed, plus the model to embed them with.

    `paths` are absolute paths the embedder can read directly. `model_id` is the
    per-analyzer-instance model selection; when set, the image daemon must be
    serving that exact model or it rejects the request (so a mismatch fails the
    analysis cleanly rather than silently embedding with the wrong model). When
    None the daemon uses whatever model it has loaded.

    `caller` / `context` are observability-only metadata. HTTP clients forward
    them as headers so daemon logs can name the backend code path/job that
    initiated inference without putting that metadata in the embedding payload.
    """

    paths: Sequence[str]
    model_id: str | None = None
    caller: str | None = None
    context: Mapping[str, str] | None = None


@dataclass(frozen=True, slots=True)
class EmbedTextRequest:
    """Texts to embed, plus the model to embed them with.

    Unlike images (one daemon, one model), text embedding supports multiple
    models (text-embedding-3-small, BGE, …) selected per request. `model_id`
    is the prefixed identifier (e.g. "openai:text-embedding-3-small"); the
    bound service resolves it to a concrete provider.

    `caller` / `context` are observability-only metadata. HTTP clients forward
    them as headers so daemon logs can name the backend code path/job that
    initiated inference without putting that metadata in the embedding payload.
    """

    texts: Sequence[str]
    model_id: str
    caller: str | None = None
    context: Mapping[str, str] | None = None


@dataclass(frozen=True, slots=True)
class EmbedResult:
    """One vector per input (path or text), in input order.

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
            NotImplementedError: if this implementation is text-only.
        """
        ...

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        """Embed each string in `request.texts` with `request.model_id`.
        Returns vectors in input order.

        Raises:
            EmbeddingServiceError: if the service is unreachable or the
                provider returned a non-recoverable error.
            NotImplementedError: if this implementation is image-only.
        """
        ...

    async def shutdown(self) -> None:
        """Release any resources (subprocess, GPU memory). Idempotent."""
        ...


class EmbeddingServiceError(Exception):
    """Raised when the embedding service cannot fulfil a request."""
