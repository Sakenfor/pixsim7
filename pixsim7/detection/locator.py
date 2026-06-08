"""
Detection capability locator — runtime registry for the DetectionService binding.

Same shape as pixsim7.embedding.locator. Single capability today; the typed
helper would cut boilerplate but isn't worth it before we have a second.
"""
from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Iterator, Optional

from pixsim7.detection.protocol import DetectionService


CAP_DETECTION_SERVICE = "detection.service"

_MISSING = object()


class _DetectionLocator:
    def __init__(self) -> None:
        self._impl: object = _MISSING
        self._lock = Lock()

    def bind(self, impl: DetectionService, *, replace: bool = True) -> None:
        with self._lock:
            if self._impl is not _MISSING and not replace:
                raise RuntimeError("detection service already bound")
            self._impl = impl

    def get(self) -> DetectionService:
        if self._impl is _MISSING:
            raise RuntimeError(
                "detection service not bound — backend must call "
                "pixsim7.backend.main.adapters.detection."
                "bind_detection_capabilities() at startup"
            )
        return self._impl  # type: ignore[return-value]

    def try_get(self) -> Optional[DetectionService]:
        return None if self._impl is _MISSING else self._impl  # type: ignore[return-value]

    @contextmanager
    def override(self, impl: DetectionService) -> Iterator[None]:
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


locator = _DetectionLocator()


def bind_detection_service(impl: DetectionService) -> None:
    locator.bind(impl)


def get_detection_service() -> DetectionService:
    return locator.get()


def try_get_detection_service() -> Optional[DetectionService]:
    return locator.try_get()
