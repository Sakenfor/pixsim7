"""
Backend-side detection service binding.

Mirrors adapters/embedding.py: this is the ONE direction of import we allow
(backend → detection). The detection package never imports backend.

Phase 1 binds a `DaemonDetectionService` that subprocesses a user-supplied
detection script (default: tools/detect_general.py --serve). The subprocess
is spawned lazily on the first detection request, so binding is cheap even
when no detector tool is installed.

Configuration (env vars, with sensible defaults):
- PIXSIM_DETECTION_COMMAND — argv string for the detection daemon process
- PIXSIM_DETECTION_MODEL_ID — model identifier recorded on each detection row

Phase 2 swap point: replace `_build_default_service()` to return an HTTP
client to a dedicated detection service — no caller changes.
"""
from __future__ import annotations

import os

from pixsim7.detection.daemon import DaemonDetectionService
from pixsim7.detection.locator import (
    bind_detection_service,
    try_get_detection_service,
)
from pixsim7.detection.protocol import DetectionService


_DEFAULT_COMMAND = "python tools/detect_general.py --serve"
_DEFAULT_MODEL_ID = "groundingdino-swint-ogc"


def _build_default_service() -> DetectionService:
    command = os.environ.get("PIXSIM_DETECTION_COMMAND", _DEFAULT_COMMAND)
    model_id = os.environ.get("PIXSIM_DETECTION_MODEL_ID", _DEFAULT_MODEL_ID)
    return DaemonDetectionService(command=command, model_id=model_id)


def bind_detection_capabilities() -> None:
    """Bind the detection service into the locator. Idempotent re-bind."""
    bind_detection_service(_build_default_service())


async def shutdown_detection_capabilities() -> None:
    """Tear down the bound detection service (kills the daemon subprocess
    if one is running). Safe to call when nothing was ever bound."""
    svc = try_get_detection_service()
    if svc is not None:
        await svc.shutdown()
