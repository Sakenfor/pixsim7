"""
Embedding capability locator — runtime registry for the EmbeddingService binding.

Same shape as pixsim7.automation.locator. Single capability today; the typed
helper would cut boilerplate but isn't worth it before we have a second.
"""
from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Iterator, Optional

from pixsim7.embedding.protocol import EmbeddingService


CAP_EMBEDDING_SERVICE = "embedding.service"

_MISSING = object()


class _EmbeddingLocator:
    def __init__(self) -> None:
        self._impl: object = _MISSING
        self._lock = Lock()

    def bind(self, impl: EmbeddingService, *, replace: bool = True) -> None:
        with self._lock:
            if self._impl is not _MISSING and not replace:
                raise RuntimeError("embedding service already bound")
            self._impl = impl

    def get(self) -> EmbeddingService:
        if self._impl is _MISSING:
            raise RuntimeError(
                "embedding service not bound — backend must call "
                "pixsim7.backend.main.adapters.embedding."
                "bind_embedding_capabilities() at startup"
            )
        return self._impl  # type: ignore[return-value]

    def try_get(self) -> Optional[EmbeddingService]:
        return None if self._impl is _MISSING else self._impl  # type: ignore[return-value]

    @contextmanager
    def override(self, impl: EmbeddingService) -> Iterator[None]:
        with self._lock:
            previous = self._impl
            self._impl = impl
        try:
            yield
        finally:
            with self._lock:
                self._impl = previous

    def reset(self) -> None:
        with self._lock:
            self._impl = _MISSING


locator = _EmbeddingLocator()


def bind_embedding_service(impl: EmbeddingService) -> None:
    locator.bind(impl)


def get_embedding_service() -> EmbeddingService:
    return locator.get()


def try_get_embedding_service() -> Optional[EmbeddingService]:
    return locator.try_get()
