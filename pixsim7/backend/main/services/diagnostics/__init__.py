"""Diagnostics service tree — admin-only runtime diagnostics ("diagnostics").

A *diagnostic* is a self-contained async generator that yields
``DiagnosticEvent`` records describing what it observes.  Diagnostics are
admin-runnable from the main app's ``/dev/testing/diagnostics`` page and
from CLI scripts that import the same classes — same code drives both.

Public API:
    from pixsim7.backend.main.services.diagnostics import (
        Diagnostic, DiagnosticEvent, DiagnosticSpec, DiagnosticParam,
        diagnostic_registry, diagnostic_run_manager,
    )

Add new diagnostics by subclassing ``Diagnostic`` and registering in
``registrations.py`` (side-effect imported by the admin route module).

The HTTP/WS surface lives in
``backend.main.api.v1.dev_testing_diagnostics`` and is wired via the
``routes/diagnostics`` plugin manifest.
"""

from .base import (
    Diagnostic,
    DiagnosticEvent,
    DiagnosticEventType,
    DiagnosticParam,
    DiagnosticParamKind,
    DiagnosticSpec,
)
from .registry import DiagnosticRegistry, diagnostic_registry
from .runs import DiagnosticRun, DiagnosticRunManager, diagnostic_run_manager

__all__ = [
    "Diagnostic",
    "DiagnosticEvent",
    "DiagnosticEventType",
    "DiagnosticParam",
    "DiagnosticParamKind",
    "DiagnosticSpec",
    "DiagnosticRegistry",
    "DiagnosticRun",
    "DiagnosticRunManager",
    "diagnostic_registry",
    "diagnostic_run_manager",
]
