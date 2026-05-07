"""Global diagnostic registry.

Diagnostics register themselves at import time from ``registrations.py``.
The admin route module imports ``registrations`` once at startup as a
side effect.
"""

from __future__ import annotations

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry

from .base import Diagnostic


class DiagnosticRegistry(SimpleRegistry[str, Diagnostic]):
    """Keyed by ``diagnostic.spec.id``."""

    def __init__(self) -> None:
        super().__init__(
            name="DiagnosticRegistry",
            allow_overwrite=False,
            seed_on_init=False,
            log_operations=False,
        )

    def _get_item_key(self, item: Diagnostic) -> str:
        return item.spec.id


diagnostic_registry = DiagnosticRegistry()
