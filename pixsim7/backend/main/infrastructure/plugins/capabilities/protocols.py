"""
Capability protocols — structural types for runtime-looked-up capabilities.

Part of the `manifest-runtime-binding` plan. These protocols define the
consumer-facing API of each registerable capability: routes and services
depend on the protocol, not on the concrete implementation. The locator
(capabilities/locator.py) binds implementations at startup; routes look
them up via FastAPI `Depends(...)`.

## Convention

- One Protocol per registerable capability.
- Read-only consumer surface only. Write operations (register_*, unregister_*)
  stay on the concrete class because only setup code should use them.
- Match method signatures to the concrete class exactly (verified by a
  structural typing check in tests — if the protocol drifts from the
  implementation, tests fail).
- Forward-reference Pydantic models and enums by import so runtime
  introspection still works.

## Adding a new protocol

1. Add the Protocol class here with the methods routes actually call (read the
   audit — do not mirror the whole class surface).
2. Wire a binding in the owning setup_* function (see protocols/locator.py).
3. Add a `Depends(get_<capability>)` dependency in one consumer to validate.
4. Add a test that asserts `isinstance(concrete, ProtocolName)` via
   typing.runtime_checkable or structural check.
"""
from __future__ import annotations

from typing import List, Optional, Protocol, runtime_checkable

from pixsim7.backend.main.services.prompt.parser.registry import (
    AnalyzerInfo,
    AnalyzerTarget,
)


@runtime_checkable
class AnalyzerRegistryProtocol(Protocol):
    """Read-only consumer surface of the analyzer registry.

    Concrete implementation: `services.prompt.parser.registry.analyzer_registry`.
    Covers every call site found in the step-1 audit:
      - api/v1/prompts/operations.py   → .get, .list_prompt_analyzers
      - api/v1/prompts/meta.py         → .list_prompt_analyzers
      - services/prompt/analysis.py    → .get

    Convenience listers are included too so future consumers don't have to
    extend the protocol — they're cheap to declare and keep the registry
    API discoverable from one place.
    """

    def get(self, analyzer_id: str) -> Optional[AnalyzerInfo]: ...

    def list_all(self) -> List[AnalyzerInfo]: ...

    def list_enabled(self, include_legacy: bool = False) -> List[AnalyzerInfo]: ...

    def list_by_target(
        self,
        target: AnalyzerTarget,
        include_legacy: bool = False,
    ) -> List[AnalyzerInfo]: ...

    def list_prompt_analyzers(self, include_legacy: bool = False) -> List[AnalyzerInfo]: ...

    def list_asset_analyzers(self, include_legacy: bool = False) -> List[AnalyzerInfo]: ...

    def list_ids(self) -> List[str]: ...
