"""
Automation capability locator — runtime registry for protocol bindings.

Pattern mirrors pixsim7.backend.main.infrastructure.plugins.capabilities.locator
(manifest-runtime-binding plan) but lives here so pixsim7.automation doesn't
need to import anything from pixsim7.backend.* at import time. That's the
whole point of the extraction.

Usage (consumers inside pixsim7.automation):
    from pixsim7.automation.locator import get_account_lookup
    account = await get_account_lookup().get(execution.account_id)

Usage (implementers — backend, tests, launcher):
    from pixsim7.automation.locator import bind_account_lookup
    bind_account_lookup(BackendAccountLookup(session_factory))
"""
from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Any, Dict, Iterator, Optional

from pixsim7.automation.protocols import (
    AccountLookup,
    JobQueue,
    PathRegistry,
    ProviderMetadataLookup,
)

CAP_ACCOUNT_LOOKUP = "automation.account_lookup"
CAP_PROVIDER_METADATA = "automation.provider_metadata"
CAP_JOB_QUEUE = "automation.job_queue"
CAP_PATH_REGISTRY = "automation.path_registry"

_MISSING = object()


class _AutomationLocator:
    def __init__(self) -> None:
        self._bindings: Dict[str, Any] = {}
        self._lock = Lock()

    def bind(self, name: str, impl: Any, *, replace: bool = True) -> None:
        with self._lock:
            if name in self._bindings and not replace:
                raise KeyError(f"capability {name!r} already bound")
            self._bindings[name] = impl

    def get(self, name: str) -> Any:
        impl = self._bindings.get(name, _MISSING)
        if impl is _MISSING:
            raise KeyError(
                f"automation capability {name!r} not bound — "
                f"backend must call pixsim7.backend.main.automation_adapters."
                f"bind_automation_capabilities() at startup"
            )
        return impl

    def try_get(self, name: str) -> Optional[Any]:
        return self._bindings.get(name)

    @contextmanager
    def override(self, name: str, impl: Any) -> Iterator[None]:
        with self._lock:
            previous = self._bindings.get(name, _MISSING)
            self._bindings[name] = impl
        try:
            yield
        finally:
            with self._lock:
                if previous is _MISSING:
                    self._bindings.pop(name, None)
                else:
                    self._bindings[name] = previous

    def reset(self) -> None:
        with self._lock:
            self._bindings.clear()


locator = _AutomationLocator()


# ── Binders (called by backend at startup) ──

def bind_account_lookup(impl: AccountLookup) -> None:
    locator.bind(CAP_ACCOUNT_LOOKUP, impl)


def bind_provider_metadata(impl: ProviderMetadataLookup) -> None:
    locator.bind(CAP_PROVIDER_METADATA, impl)


def bind_job_queue(impl: JobQueue) -> None:
    locator.bind(CAP_JOB_QUEUE, impl)


def bind_path_registry(impl: PathRegistry) -> None:
    locator.bind(CAP_PATH_REGISTRY, impl)


# ── Typed getters (used inside pixsim7.automation) ──

def get_account_lookup() -> AccountLookup:
    return locator.get(CAP_ACCOUNT_LOOKUP)


def get_provider_metadata() -> ProviderMetadataLookup:
    return locator.get(CAP_PROVIDER_METADATA)


def get_job_queue() -> JobQueue:
    return locator.get(CAP_JOB_QUEUE)


def get_path_registry() -> PathRegistry:
    return locator.get(CAP_PATH_REGISTRY)
