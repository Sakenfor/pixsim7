"""HTTP client implementation of the EmbeddingService protocol.

Talks to the standalone `pixsim7.embedding.server` (the launcher-managed
`embedding-daemon` service) over HTTP. This is the image path in the
backend — it has **no torch dependency**, so binding it in the fastapi host
costs nothing. Image embedding routes here; text embedding stays host-side.

Graceful failure: if the service is unreachable / times out / returns a bad
response, `embed_images` raises `EmbeddingServiceError`. The analysis worker
already catches that, marks the analysis failed, and lets it retry later — so a
down daemon never blocks other work.
"""
from __future__ import annotations

import httpx

from pixsim7.embedding.protocol import (
    EmbeddingService,
    EmbeddingServiceError,
    EmbedRequest,
    EmbedResult,
    EmbedTextRequest,
)


class HttpEmbeddingService(EmbeddingService):
    """Embeds images via the embedding-daemon HTTP service."""

    def __init__(
        self,
        *,
        base_url: str,
        model_id: str,
        connect_timeout: float = 5.0,
        read_timeout: float = 180.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model_id = model_id
        # Short connect timeout so an unreachable service fails fast (graceful
        # fallback); long read timeout to cover cold-batch inference.
        self._timeout = httpx.Timeout(
            connect=connect_timeout, read=read_timeout, write=10.0, pool=connect_timeout
        )
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout)
        return self._client

    async def embed_images(self, request: EmbedRequest) -> EmbedResult:
        if not request.paths:
            return EmbedResult(
                vectors=[], dim=0, model_id=request.model_id or self._model_id
            )

        payload: dict[str, object] = {"paths": list(request.paths)}
        if request.model_id is not None:
            payload["model_id"] = request.model_id
        try:
            response = await self._get_client().post("/embed", json=payload)
        except httpx.HTTPError as exc:
            raise EmbeddingServiceError(
                f"embedding service unreachable at {self._base_url}: {exc}"
            ) from exc

        if response.status_code != 200:
            raise EmbeddingServiceError(
                f"embedding service returned HTTP {response.status_code}: "
                f"{response.text[:200]!r}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise EmbeddingServiceError(
                f"embedding service returned non-JSON: {response.text[:200]!r}"
            ) from exc

        vectors_raw = data.get("embeddings")
        if not isinstance(vectors_raw, list):
            raise EmbeddingServiceError("embedding response missing 'embeddings' list")

        vectors: list[list[float]] = []
        for v in vectors_raw:
            if not isinstance(v, list):
                raise EmbeddingServiceError("non-list vector in embedding response")
            vectors.append([float(x) for x in v])

        dim = len(vectors[0]) if vectors else 0
        if any(len(v) != dim for v in vectors):
            raise EmbeddingServiceError("embedding service returned vectors with mixed dims")

        # Provenance is the model the daemon actually used (from its response),
        # not this adapter's env default — they diverge once instances select a
        # model. Fall back to the configured id if the daemon omits it.
        served_model_id = data.get("model_id")
        provenance_model_id = (
            served_model_id if isinstance(served_model_id, str) and served_model_id
            else self._model_id
        )
        return EmbedResult(vectors=vectors, dim=dim, model_id=provenance_model_id)

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        raise NotImplementedError(
            "HttpEmbeddingService embeds images only; text embedding is routed "
            "through the text-provider registry by the bound composite."
        )

    async def shutdown(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
