"""Diagnostic base classes + event/spec dataclasses.

A diagnostic is shaped like::

    class MyDiagnostic(Diagnostic):
        spec = DiagnosticSpec(
            id="my-diagnostic",
            label="My Diagnostic",
            description="Does the thing.",
            params=(DiagnosticParam(name="duration", kind="int", label="Duration (s)", default=5),),
        )

        async def run(self, params, cancel_event):
            yield DiagnosticEvent(t_rel=0.0, type="phase", payload={"phase": "running"})
            ...

The runner translates ``DiagnosticEvent`` objects to flat JSON dicts on
the wire (``{"t_rel": ..., "type": ..., **payload}``) — so payloads should
be JSON-safe.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, ClassVar, Literal, Optional


# Event type vocabulary — kept small and stable so the frontend can switch on
# `type` without coordinating schema bumps.  Add entries here only when a new
# kind is genuinely distinct from the existing ones.
DiagnosticEventType = Literal[
    "phase",        # phase strip transitioned: payload={"phase": "<key>"}
    "observation",  # generic timestamped observation: payload={...diagnostic-specific}
    "transition",   # named milestone: payload={"key": "...", "value": ...}
    "summary",      # final summary: payload={...}
    "log",          # informational log line: payload={"level": "...", "message": "..."}
    "terminal",     # run finished: payload={"status": "completed"|"cancelled"|"errored"}
    "error",        # diagnostic-side error: payload={"message": "..."}
]


@dataclass(frozen=True)
class DiagnosticEvent:
    """One record emitted by a diagnostic's async generator.

    ``payload`` is merged flat into the wire JSON next to ``t_rel`` and
    ``type``, so use a flat dict of JSON-safe primitives.
    """

    t_rel: float
    type: DiagnosticEventType
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"t_rel": self.t_rel, "type": self.type, **self.payload}


# --- Spec / params (drive the run-form UI on the frontend) -------------------


DiagnosticParamKind = Literal["string", "int", "float", "bool", "select"]


@dataclass(frozen=True)
class DiagnosticParam:
    name: str
    kind: DiagnosticParamKind
    label: str
    default: Any = None
    options: Optional[list[str]] = None  # only for kind="select"
    description: Optional[str] = None
    required: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "kind": self.kind,
            "label": self.label,
            "default": self.default,
            "options": list(self.options) if self.options else None,
            "description": self.description,
            "required": self.required,
        }


@dataclass(frozen=True)
class DiagnosticSpec:
    """Static metadata about a diagnostic — surfaced on the listing API."""

    id: str
    label: str
    description: str
    params: tuple[DiagnosticParam, ...] = ()
    category: str = "diagnostic"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "category": self.category,
            "params": [p.to_dict() for p in self.params],
        }


# --- Diagnostic ABC ----------------------------------------------------------


class Diagnostic(ABC):
    """Abstract base for runnable diagnostics.

    Subclasses set ``spec`` as a class attribute and implement ``run`` as
    an async generator.  The runner is responsible for collecting events,
    tracking elapsed time, and observing ``cancel_event``.
    """

    spec: ClassVar[DiagnosticSpec]

    @abstractmethod
    def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        """Yield ``DiagnosticEvent`` records.  Subclasses override as
        ``async def`` with ``yield`` statements (making this an async
        generator).

        Implementations should periodically check ``cancel_event.is_set()``
        and return early when set.  The runner emits its own terminal
        event regardless of how the generator exits.
        """
        raise NotImplementedError
