"""
Subprocess-backed EmbeddingService implementation.

Owns one long-lived Python child running `python -m pixsim7.embedding.cli.image_local --serve`.
The child loads the model once and processes line-delimited JSON requests on
stdin, writing one JSON response per request on stdout. We serialize requests
behind an asyncio.Lock (GPU work is single-stream anyway) and auto-restart on
crash.

Usage (called from backend's adapters/embedding.py at startup):

    daemon = DaemonEmbeddingService(
        command=["python", "-m", "pixsim7.embedding.cli.image_local", "--serve"],
        model_id="google/siglip2-large-patch16-384",
    )
    bind_embedding_service(daemon)

Lifecycle:
- Lazy: subprocess is only spawned on the first request. Idle deploys don't
  pay the model-load cost.
- Persistent: once spawned, stays alive for the host process's lifetime.
- Crash-recovering: if the child dies, the next request restarts it.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shlex
from typing import Optional

from pixsim7.embedding.protocol import (
    EmbedRequest,
    EmbedResult,
    EmbedTextRequest,
    EmbeddingService,
    EmbeddingServiceError,
)

logger = logging.getLogger(__name__)

# Single-request timeout. Loading the model on first request can take 10-30s
# on cold cache; subsequent inferences are fast. Generous default; configurable.
_DEFAULT_REQUEST_TIMEOUT_SEC = 180.0


class DaemonEmbeddingService(EmbeddingService):
    def __init__(
        self,
        *,
        command: list[str] | str,
        model_id: str,
        request_timeout_sec: float = _DEFAULT_REQUEST_TIMEOUT_SEC,
    ) -> None:
        if isinstance(command, str):
            command = shlex.split(command)
        if not command:
            raise ValueError("command must be a non-empty argv list")

        self._command = list(command)
        self._model_id = model_id
        self._timeout = request_timeout_sec

        self._proc: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._spawn_lock = asyncio.Lock()

    async def embed_images(self, request: EmbedRequest) -> EmbedResult:
        if not request.paths:
            return EmbedResult(vectors=[], dim=0, model_id=self._model_id)

        payload = {"task": "embed_images", "paths": list(request.paths)}

        async with self._lock:
            try:
                response = await self._exchange(payload)
            except (BrokenPipeError, ConnectionResetError, EOFError) as exc:
                logger.warning("embedding_daemon_io_failure error=%s", exc)
                await self._kill_child()
                response = await self._exchange(payload)

        if "error" in response:
            raise EmbeddingServiceError(str(response["error"]))

        vectors_raw = response.get("embeddings")
        if not isinstance(vectors_raw, list):
            raise EmbeddingServiceError("daemon response missing 'embeddings' list")

        vectors: list[list[float]] = []
        for v in vectors_raw:
            if not isinstance(v, list):
                raise EmbeddingServiceError("non-list vector in daemon response")
            vectors.append([float(x) for x in v])

        dim = len(vectors[0]) if vectors else 0
        if any(len(v) != dim for v in vectors):
            raise EmbeddingServiceError("daemon returned vectors with mixed dims")

        return EmbedResult(vectors=vectors, dim=dim, model_id=self._model_id)

    async def embed_texts(self, request: EmbedTextRequest) -> EmbedResult:
        raise NotImplementedError(
            "DaemonEmbeddingService embeds images only; text embedding is "
            "routed through the text-provider registry by the bound composite."
        )

    async def shutdown(self) -> None:
        async with self._lock:
            await self._kill_child()

    # ── internals ──

    async def _exchange(self, payload: dict) -> dict:
        proc = await self._ensure_child()

        line = json.dumps(payload, separators=(",", ":")).encode("utf-8") + b"\n"
        assert proc.stdin is not None and proc.stdout is not None

        proc.stdin.write(line)
        await proc.stdin.drain()

        try:
            response_bytes = await asyncio.wait_for(
                proc.stdout.readline(), timeout=self._timeout
            )
        except asyncio.TimeoutError as exc:
            # A timed-out child is almost certainly wedged (stuck decode /
            # deadlock) AND the pipe is now desynchronized — its eventual
            # response would be misread as the reply to the *next* request.
            # Recycle it so the next call spawns a clean child instead of
            # inheriting a poisoned one and eating another full timeout.
            await self._kill_child()
            raise EmbeddingServiceError(
                f"embedding daemon timed out after {self._timeout}s (child recycled)"
            ) from exc

        if not response_bytes:
            # Child closed stdout — likely crashed. Surface as a recoverable
            # I/O error so the caller can retry once.
            stderr_tail = await self._drain_stderr(max_bytes=2000)
            raise EOFError(f"daemon closed stdout; stderr tail: {stderr_tail!r}")

        try:
            return json.loads(response_bytes.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise EmbeddingServiceError(
                f"daemon returned non-JSON: {response_bytes[:200]!r}"
            ) from exc

    async def _ensure_child(self) -> asyncio.subprocess.Process:
        if self._proc is not None and self._proc.returncode is None:
            return self._proc

        async with self._spawn_lock:
            if self._proc is not None and self._proc.returncode is None:
                return self._proc

            logger.info(
                "embedding_daemon_spawning command=%s",
                " ".join(self._command),
            )
            self._proc = await asyncio.create_subprocess_exec(
                *self._command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy(),
            )
            return self._proc

    async def _kill_child(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None or proc.returncode is not None:
            return

        try:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
        except ProcessLookupError:
            pass

    async def _drain_stderr(self, *, max_bytes: int) -> str:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return ""
        try:
            data = await asyncio.wait_for(proc.stderr.read(max_bytes), timeout=0.5)
        except asyncio.TimeoutError:
            return ""
        return data.decode("utf-8", errors="replace")
