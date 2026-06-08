"""
DetectionService protocol — the only thing backend (and any future consumer)
talks to. All exchange shapes are frozen DTOs so a Phase-2 split to a separate
process or service stays reachable without touching call sites.

Design invariants:
- Every method is async (HTTP-ready for a future service split).
- Inputs and outputs are frozen dataclasses; no SQLModel rows, no ORM objects.
- Zones are dicts (not nested DTOs) so the result is the same JSON shape the
  frontend overlay already consumes — no translation layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Sequence


@dataclass(frozen=True, slots=True)
class DetectRequest:
    """One image to run detection on.

    `image_path` is an absolute path the detector can read directly.
    `labels` is an open-vocabulary concept list ("dog", "person"); closed-
    vocabulary detectors can ignore it and return their own class list.
    `score_threshold` overrides the detector's default confidence cutoff.
    """

    image_path: str
    labels: Sequence[str] = ()
    score_threshold: Optional[float] = None


@dataclass(frozen=True, slots=True)
class DetectResult:
    """Zones detected in the image, in input order of confidence.

    `zones` are JSON-ready dicts matching the NpcBodyZone shape consumed by
    the frontend overlay (id, label, shape, coords, score). Coords are
    percentage-based (0–100 of image dims). `model_id` is recorded on the
    analysis row for provenance.
    """

    zones: list[dict]
    confidence: Optional[float]
    model_id: str


class DetectionService(Protocol):
    """Image-detection capability.

    Implementations must be safe to call concurrently from async code; they
    serialize internally if the underlying inference is single-threaded.
    """

    async def detect(self, request: DetectRequest) -> DetectResult:
        """Run detection on `request.image_path`.

        Raises:
            DetectionServiceError: if the service is unreachable or the
                inference subprocess returned a non-recoverable error.
        """
        ...

    async def shutdown(self) -> None:
        """Release any resources (subprocess, GPU memory). Idempotent."""
        ...


class DetectionServiceError(Exception):
    """Raised when the detection service cannot fulfil a request."""
