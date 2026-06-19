"""
Unit tests for DaemonEmbeddingService.

Covers the trickiest bits: lazy spawn, warm reuse across requests,
crash-recovery via stdin EOF, timeout, shutdown idempotency, and the
empty-paths short-circuit (which must not spawn the subprocess).

Strategy: patch `asyncio.create_subprocess_exec` to return a fake
asyncio.subprocess.Process driven by per-test queues. No real subprocess,
no real model — the daemon's own logic is what's under test.
"""
from __future__ import annotations

import asyncio
import json
from typing import Optional
from unittest.mock import patch

import pytest

from pixsim7.embedding.daemon import DaemonEmbeddingService
from pixsim7.embedding.protocol import EmbedRequest, EmbeddingServiceError


class _FakeStream:
    """Minimal stand-in for asyncio.StreamWriter / StreamReader used by the daemon."""

    def __init__(self) -> None:
        self._lines: asyncio.Queue[bytes] = asyncio.Queue()
        self.written: list[bytes] = []
        self._closed = False

    async def readline(self) -> bytes:
        return await self._lines.get()

    def write(self, data: bytes) -> None:
        if self._closed:
            raise BrokenPipeError("fake stream closed")
        self.written.append(data)

    async def drain(self) -> None:
        return None

    async def read(self, n: int = -1) -> bytes:
        return b""

    def feed(self, line: bytes) -> None:
        self._lines.put_nowait(line)

    def feed_eof(self) -> None:
        # Empty bytes signals EOF in StreamReader.readline()
        self._lines.put_nowait(b"")

    def close(self) -> None:
        self._closed = True


class _FakeProcess:
    """Stand-in for asyncio.subprocess.Process."""

    def __init__(self) -> None:
        self.stdin = _FakeStream()
        self.stdout = _FakeStream()
        self.stderr = _FakeStream()
        self.returncode: Optional[int] = None

    def terminate(self) -> None:
        if self.returncode is None:
            self.returncode = -15
        self.stdout.feed_eof()
        self.stdin.close()

    def kill(self) -> None:
        self.returncode = -9
        self.stdout.feed_eof()
        self.stdin.close()

    async def wait(self) -> int:
        if self.returncode is None:
            self.returncode = 0
        return self.returncode


def _patch_spawn(processes: list[_FakeProcess]):
    """Returns a patcher that pops one fake process per spawn call."""
    iterator = iter(processes)

    async def fake_spawn(*_args, **_kwargs):
        return next(iterator)

    return patch(
        "pixsim7.embedding.daemon.asyncio.create_subprocess_exec",
        new=fake_spawn,
    )


def _make_service(timeout: float = 5.0) -> DaemonEmbeddingService:
    return DaemonEmbeddingService(
        command=["python", "-c", "pass"],
        model_id="test-model",
        request_timeout_sec=timeout,
    )


@pytest.mark.asyncio
async def test_lazy_spawn_only_on_first_request() -> None:
    """No paths request must NOT spawn the subprocess."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"embeddings":[[0.1,0.2]]}\n')

    svc = _make_service()
    with _patch_spawn([proc]):
        result = await svc.embed_images(EmbedRequest(paths=[]))

    assert result.vectors == []
    assert result.dim == 0
    # No request was actually written — empty paths short-circuit
    assert proc.stdin.written == []


@pytest.mark.asyncio
async def test_warm_reuse_across_requests() -> None:
    """Two requests should reuse the same subprocess."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"embeddings":[[0.1,0.2]]}\n')
    proc.stdout.feed(b'{"embeddings":[[0.3,0.4]]}\n')

    svc = _make_service()
    with _patch_spawn([proc]):  # only one fake — second spawn would StopIteration
        r1 = await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))
        r2 = await svc.embed_images(EmbedRequest(paths=["/b.jpg"]))

    assert r1.vectors == [[0.1, 0.2]]
    assert r2.vectors == [[0.3, 0.4]]
    assert len(proc.stdin.written) == 2


@pytest.mark.asyncio
async def test_crash_during_request_triggers_restart() -> None:
    """If the subprocess closes stdout mid-request, the daemon should respawn
    transparently and retry the same request once."""
    crashed = _FakeProcess()
    crashed.stdout.feed_eof()  # closes stdout immediately
    crashed.returncode = 1

    healthy = _FakeProcess()
    healthy.stdout.feed(b'{"embeddings":[[0.5]]}\n')

    svc = _make_service()
    with _patch_spawn([crashed, healthy]):
        result = await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))

    assert result.vectors == [[0.5]]
    # First subprocess saw the request; recovery sent it again to the second
    assert len(crashed.stdin.written) == 1
    assert len(healthy.stdin.written) == 1


@pytest.mark.asyncio
async def test_timeout_raises_service_error() -> None:
    """If stdout never returns within the timeout, raise EmbeddingServiceError."""
    proc = _FakeProcess()
    # Don't feed any response — readline blocks forever

    svc = _make_service(timeout=0.05)
    with _patch_spawn([proc]):
        with pytest.raises(EmbeddingServiceError, match="timed out"):
            await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))


@pytest.mark.asyncio
async def test_timeout_recycles_child() -> None:
    """A timed-out child must be killed so the next request spawns a clean one.

    Otherwise the wedged child (and its desynchronized pipe) poisons every
    subsequent request, each eating another full timeout — the cascade that
    starved the worker pool in the incident."""
    wedged = _FakeProcess()  # never feeds a response → first request times out
    healthy = _FakeProcess()
    healthy.stdout.feed(b'{"embeddings":[[0.7]]}\n')

    svc = _make_service(timeout=0.05)
    with _patch_spawn([wedged, healthy]):
        with pytest.raises(EmbeddingServiceError, match="timed out"):
            await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))
        # The timeout handler terminated the wedged child...
        assert wedged.returncode is not None
        # ...so the next request spawns the second (healthy) child and succeeds.
        result = await svc.embed_images(EmbedRequest(paths=["/b.jpg"]))

    assert result.vectors == [[0.7]]
    assert len(healthy.stdin.written) == 1


@pytest.mark.asyncio
async def test_daemon_returned_error_propagates() -> None:
    """When the daemon returns {"error": ...}, raise EmbeddingServiceError."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"error":"bad model"}\n')

    svc = _make_service()
    with _patch_spawn([proc]):
        with pytest.raises(EmbeddingServiceError, match="bad model"):
            await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))


@pytest.mark.asyncio
async def test_mixed_dim_vectors_rejected() -> None:
    """Vectors of inconsistent lengths in one response should be rejected."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"embeddings":[[0.1,0.2],[0.3]]}\n')

    svc = _make_service()
    with _patch_spawn([proc]):
        with pytest.raises(EmbeddingServiceError, match="mixed dims"):
            await svc.embed_images(EmbedRequest(paths=["/a.jpg", "/b.jpg"]))


@pytest.mark.asyncio
async def test_shutdown_kills_running_child() -> None:
    """shutdown() must terminate the subprocess if one is running."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"embeddings":[[0.1]]}\n')

    svc = _make_service()
    with _patch_spawn([proc]):
        await svc.embed_images(EmbedRequest(paths=["/a.jpg"]))
        await svc.shutdown()

    assert proc.returncode is not None  # was terminated


@pytest.mark.asyncio
async def test_shutdown_safe_when_never_started() -> None:
    """shutdown() must be a no-op when the daemon was never spawned."""
    svc = _make_service()
    # No spawn patcher — would fail if we tried to spawn anything
    await svc.shutdown()


@pytest.mark.asyncio
async def test_request_payload_is_well_formed() -> None:
    """The wire format the daemon receives must be the documented contract."""
    proc = _FakeProcess()
    proc.stdout.feed(b'{"embeddings":[[0.0]]}\n')

    svc = _make_service()
    with _patch_spawn([proc]):
        await svc.embed_images(EmbedRequest(paths=["/x.png", "/y.png"]))

    sent = proc.stdin.written[0]
    payload = json.loads(sent.decode("utf-8"))
    assert payload == {"task": "embed_images", "paths": ["/x.png", "/y.png"]}
    assert sent.endswith(b"\n")
