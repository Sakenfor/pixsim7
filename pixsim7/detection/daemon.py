"""
Subprocess-backed DetectionService implementation.

Owns one long-lived Python child running a detection script (e.g.
`tools/detect_general.py --serve`). The child loads the model once and
processes line-delimited JSON requests on stdin, writing one JSON response
per request on stdout. We serialize requests behind an asyncio.Lock (GPU
work is single-stream anyway) and auto-restart on crash.

Wire format (mirrors the embedding daemon):

    request  (stdin):   {"task":"detect","image_path":"...",
                         "labels":["dog","person"],
                         "score_threshold":0.3}
    response (stdout):  {"zones":[{...},...],"confidence":0.85}
    error    (stdout):  {"error":"message"}

Zones in the response are passed through verbatim into AssetAnalysis.result,
so the script is responsible for emitting the NpcBodyZone shape the frontend
overlay consumes (id, label, shape, coords, score) with percentage-based
coords (0–100 of image dims).

Lifecycle:
- Lazy: subprocess is only spawned on the first request. Idle deploys don't
  pay the model-load cost.
- Persistent: once spawned, stays alive for the host process's lifetime.
- Crash-recovering: if the child dies, the next request restarts it.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shlex
from typing import Optional

from pixsim7.detection.protocol import (
    DetectRequest,
    DetectResult,
    DetectionService,
    DetectionServiceError,
)

logger = logging.getLogger(__name__)

# Detection models (SAM, GroundingDINO, YOLO-World) can take 30–60s to load
# on cold cache; inference is fast thereafter. Generous default; configurable.
_DEFAULT_REQUEST_TIMEOUT_SEC = 180.0


class DaemonDetectionService(DetectionService):
    def __init__(
        self,
        *,
        command: list[str] | str,
        model_id: str,
        request_timeout_sec: float = _DEFAULT_REQUEST_TIMEOUT_SEC,
    ) -> None:
        if isinstance(command, str):
            command = shlex.split(command)
        if not command:
            raise ValueError("command must be a non-empty argv list")

        self._command = list(command)
        self._model_id = model_id
        self._timeout = request_timeout_sec

        self._proc: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._spawn_lock = asyncio.Lock()

    async def detect(self, request: DetectRequest) -> DetectResult:
        payload: dict = {
            "task": "detect",
            "image_path": request.image_path,
            "labels": list(request.labels),
        }
        if request.score_threshold is not None:
            payload["score_threshold"] = request.score_threshold

        async with self._lock:
            try:
                response = await self._exchange(payload)
            except (BrokenPipeError, ConnectionResetError, EOFError) as exc:
                logger.warning("detection_daemon_io_failure error=%s", exc)
                await self._kill_child()
                response = await self._exchange(payload)

        if "error" in response:
            raise DetectionServiceError(str(response["error"]))

        zones_raw = response.get("zones")
        if not isinstance(zones_raw, list):
            raise DetectionServiceError("daemon response missing 'zones' list")

        zones: list[dict] = []
        for i, z in enumerate(zones_raw):
            if not isinstance(z, dict):
                raise DetectionServiceError(
                    f"zone [{i}] is {type(z).__name__}, expected object"
                )
            zones.append(z)

        confidence_raw = response.get("confidence")
        confidence: Optional[float]
        if confidence_raw is None:
            confidence = None
        elif isinstance(confidence_raw, (int, float)) and not isinstance(confidence_raw, bool):
            confidence = float(confidence_raw)
        else:
            raise DetectionServiceError(
                f"confidence is {type(confidence_raw).__name__}, expected number"
            )

        return DetectResult(zones=zones, confidence=confidence, model_id=self._model_id)

    async def shutdown(self) -> None:
        async with self._lock:
            await self._kill_child()

    # ── internals ──

    async def _exchange(self, payload: dict) -> dict:
        proc = await self._ensure_child()

        line = json.dumps(payload, separators=(",", ":")).encode("utf-8") + b"\n"
        assert proc.stdin is not None and proc.stdout is not None

        proc.stdin.write(line)
        await proc.stdin.drain()

        try:
            response_bytes = await asyncio.wait_for(
                proc.stdout.readline(), timeout=self._timeout
            )
        except asyncio.TimeoutError as exc:
            raise DetectionServiceError(
                f"detection daemon timed out after {self._timeout}s"
            ) from exc

        if not response_bytes:
            stderr_tail = await self._drain_stderr(max_bytes=2000)
            raise EOFError(f"daemon closed stdout; stderr tail: {stderr_tail!r}")

        try:
            return json.loads(response_bytes.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise DetectionServiceError(
                f"daemon returned non-JSON: {response_bytes[:200]!r}"
            ) from exc

    async def _ensure_child(self) -> asyncio.subprocess.Process:
        if self._proc is not None and self._proc.returncode is None:
            return self._proc

        async with self._spawn_lock:
            if self._proc is not None and self._proc.returncode is None:
                return self._proc

            logger.info(
                "detection_daemon_spawning command=%s",
                " ".join(self._command),
            )
            self._proc = await asyncio.create_subprocess_exec(
                *self._command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy(),
            )
            return self._proc

    async def _kill_child(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None or proc.returncode is not None:
            return

        try:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
        except ProcessLookupError:
            pass

    async def _drain_stderr(self, *, max_bytes: int) -> str:
        proc = self._proc
        if proc is None or proc.stderr is None:
            return ""
        try:
            data = await asyncio.wait_for(proc.stderr.read(max_bytes), timeout=0.5)
        except asyncio.TimeoutError:
            return ""
        return data.decode("utf-8", errors="replace")
