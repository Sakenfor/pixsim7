"""
CapabilityLocator — runtime registry of bound capabilities.

Part of the `manifest-runtime-binding` plan. Routes and services use this
instead of importing concrete registries directly. Bindings are registered
in `setup_*` functions during app startup; tests can scope overrides via
the `override` context manager.

## Design

- One process-wide `capability_locator` instance. Thread-safe binding.
- Bind keys are string constants (`CAP_*`) exported from this module so
  typos fail at import, not runtime.
- Consumers fetch either:
    * `capability_locator.get(CAP_X)` for raw lookup, or
    * module-level `get_analyzer_registry()` / `Depends(get_analyzer_registry)`
      helpers that type-narrow the return to the relevant Protocol.
- `override(name, impl)` context manager restores the previous binding on
  exit — pytest fixtures can use it without global state leaks.

## Binding site

Startup wiring lives in `bind_default_capabilities()`. Both main-api and
generation-api lifespans call this once; the helper is idempotent.
"""
from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Any, Dict, Iterator, Optional, Type, TypeVar

from pixsim7.backend.main.infrastructure.plugins.capabilities.protocols import (
    AnalyzerRegistryProtocol,
)

# Canonical capability names — use these everywhere, not raw strings.
CAP_ANALYZER_REGISTRY = "analyzer_registry"


_T = TypeVar("_T")
_MISSING = object()


class CapabilityLocator:
    """Process-wide registry. `bind` at startup, `get` at runtime."""

    def __init__(self) -> None:
        self._bindings: Dict[str, Any] = {}
        self._lock = Lock()

    def bind(self, name: str, impl: Any, *, replace: bool = False) -> None:
        """Register `impl` under `name`.

        Raises KeyError if already bound and `replace` is False — prevents
        silent double-binding from duplicate setup calls.
        """
        with self._lock:
            if name in self._bindings and not replace:
                raise KeyError(
                    f"capability {name!r} already bound; pass replace=True to overwrite"
                )
            self._bindings[name] = impl

    def unbind(self, name: str) -> None:
        with self._lock:
            self._bindings.pop(name, None)

    def get(self, name: str, *, expected_type: Optional[Type[_T]] = None) -> _T:
        """Fetch a bound capability or raise.

        `expected_type` is an optional isinstance check — for protocols marked
        `@runtime_checkable` this gives a clearer error than the first attribute
        access would.
        """
        impl = self._bindings.get(name, _MISSING)
        if impl is _MISSING:
            raise KeyError(
                f"capability {name!r} not bound (call bind_default_capabilities() at startup)"
            )
        if expected_type is not None and not isinstance(impl, expected_type):
            raise TypeError(
                f"capability {name!r} is {type(impl).__name__}; expected {expected_type.__name__}"
            )
        return impl  # type: ignore[return-value]

    def try_get(self, name: str) -> Optional[Any]:
        """Non-raising variant — returns None if unbound."""
        return self._bindings.get(name)

    def list_bound(self) -> Dict[str, Any]:
        """Snapshot of current bindings (copy; safe to iterate)."""
        with self._lock:
            return dict(self._bindings)

    @contextmanager
    def override(self, name: str, impl: Any) -> Iterator[None]:
        """Temporarily rebind `name` to `impl`; restore on exit.

        Use in tests: `with capability_locator.override(CAP_X, fake): ...`
        """
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
        """Clear all bindings. For test teardown only."""
        with self._lock:
            self._bindings.clear()


# Process-wide instance
capability_locator = CapabilityLocator()


# ── Binding helpers ──

def bind_default_capabilities() -> None:
    """Bind the concrete implementations for every capability shipped today.

    Idempotent: safe to call from both main-api and generation-api lifespans.
    Uses replace=True so a re-run (e.g., reload) doesn't raise.
    """
    from pixsim7.backend.main.services.prompt.parser.registry import (
        analyzer_registry,
    )

    capability_locator.bind(
        CAP_ANALYZER_REGISTRY, analyzer_registry, replace=True
    )


# ── Typed getters (for both direct use and FastAPI Depends) ──

def get_analyzer_registry() -> AnalyzerRegistryProtocol:
    """Return the bound analyzer registry.

    Usage in routes:
        @router.get(...)
        def handler(analyzers: AnalyzerRegistryProtocol = Depends(get_analyzer_registry)):
            ...

    Usage outside routes:
        registry = get_analyzer_registry()
    """
    return capability_locator.get(
        CAP_ANALYZER_REGISTRY, expected_type=AnalyzerRegistryProtocol
    )
