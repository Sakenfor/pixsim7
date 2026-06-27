"""
Protocol-stability snapshot for the embedding sibling package.

The pixsim7.embedding protocol is the wire shape across the
backend↔embedding seam. If any change shows up here it should be a deliberate
review-time decision, because Phase-2/3 splits (HTTP/gRPC service) will fail
if backend and embedding drift apart.

When a change here is intentional, update the assertion in the same commit
that changes the protocol — that pairing is exactly what review needs to see.
"""
from __future__ import annotations

import dataclasses
import inspect
from typing import get_type_hints

from pixsim7.embedding.protocol import (
    EmbedRequest,
    EmbedResult,
    EmbedTextRequest,
    EmbeddingService,
    EmbeddingServiceError,
)


def _method_signature(cls, method_name: str) -> str:
    """Render `inspect.signature` to a string the assertion can match against."""
    return str(inspect.signature(getattr(cls, method_name)))


def _field_names(dc) -> list[str]:
    return [f.name for f in dataclasses.fields(dc)]


# ── Method signatures ──────────────────────────────────────────────────


def test_embed_images_signature() -> None:
    # Note: protocol.py uses `from __future__ import annotations`, so
    # signatures render type annotations as quoted forward refs.
    assert _method_signature(EmbeddingService, "embed_images") == (
        "(self, request: 'EmbedRequest') -> 'EmbedResult'"
    )


def test_embed_texts_signature() -> None:
    assert _method_signature(EmbeddingService, "embed_texts") == (
        "(self, request: 'EmbedTextRequest') -> 'EmbedResult'"
    )


def test_shutdown_signature() -> None:
    assert _method_signature(EmbeddingService, "shutdown") == "(self) -> 'None'"


def test_only_documented_methods_on_protocol() -> None:
    """Adding methods to the Protocol is an API change; assert the surface."""
    public = sorted(
        name for name, attr in inspect.getmembers(EmbeddingService)
        if inspect.isfunction(attr) and not name.startswith("_")
    )
    assert public == ["embed_images", "embed_texts", "shutdown"]


# ── DTO field names ────────────────────────────────────────────────────


def test_embed_request_fields() -> None:
    assert _field_names(EmbedRequest) == ["paths", "model_id", "caller", "context"]


def test_embed_text_request_fields() -> None:
    assert _field_names(EmbedTextRequest) == ["texts", "model_id", "caller", "context"]


def test_embed_result_fields() -> None:
    assert _field_names(EmbedResult) == ["vectors", "dim", "model_id"]


def test_dtos_are_frozen_and_slotted() -> None:
    """Snapshot DTOs crossing the boundary must stay immutable + slotted —
    that's a Phase-3 wire-stability commitment, not just a stylistic choice."""
    for dc in (EmbedRequest, EmbedTextRequest, EmbedResult):
        params = dc.__dataclass_params__
        assert params.frozen, f"{dc.__name__} must be frozen=True"
        # `slots` isn't recorded on __dataclass_params__; a slotted dataclass
        # carries __slots__ and has no per-instance __dict__.
        assert "__slots__" in dc.__dict__, f"{dc.__name__} must be slots=True"


# ── Error class identity ───────────────────────────────────────────────


def test_service_error_is_exception() -> None:
    assert issubclass(EmbeddingServiceError, Exception)


# ── Type hints resolve cleanly ────────────────────────────────────────


def test_dto_type_hints_resolve() -> None:
    """Forward references in the protocol module must resolve — catches
    typos and missing imports that would only blow up at first use."""
    for dc in (EmbedRequest, EmbedTextRequest, EmbedResult):
        # Will raise NameError if any annotation can't be resolved
        get_type_hints(dc)
