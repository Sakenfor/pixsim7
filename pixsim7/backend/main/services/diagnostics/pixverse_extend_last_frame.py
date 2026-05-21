"""Pixverse extend last-frame diagnostic.

Backend port of ``tests/manual_test_pixverse_extend_last_frame.py``.
Verifies that ``last_frame_url`` plumbing reaches the Pixverse OpenAPI
``/video/extend`` payload (as ``customer_video_last_frame_url``).

Two modes (``ab_mode`` param):

* **single** — submit ONE extend with ``last_frame_url`` set explicitly,
  capture the raw request payload Pixverse receives, poll to terminal,
  surface the final video URL.
* **A/B** — submit TWO extends in parallel on the same source/prompt:
  one WITH ``last_frame_url`` (dict form), one WITHOUT (legacy
  ``video_id:<id>`` string form). Both polled concurrently; both rows
  surfaced for side-by-side comparison.

Phases
    init        →  build client, resolve source video_id, fetch last-frame URL
    submitting  →  submit extend(s), capture payload(s)
    polling     →  poll each new video to terminal
    done

A/B mode costs two extend credits; single mode costs one — this hits the
live Pixverse API, so it's admin-gated like every diagnostic.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator, Optional

from .base import Diagnostic, DiagnosticEvent, DiagnosticParam, DiagnosticSpec

logger = logging.getLogger(__name__)


_DEFAULT_PROMPT = "scene continues in same style how it looks like is"
_TERMINAL_STATES = ("completed", "filtered", "failed")

# Sentinel pushed by the worker coroutine onto the internal event queue.
_DONE = object()


def _install_request_capture(client: Any, label: str, sink: dict) -> Any:
    """Monkey-patch ``client.api._request`` to record the extend payload.

    Returns the original method so the caller can restore it.  Mirrors the
    manual test: every ``/video/extend`` call (OpenAPI or WebAPI) lands in
    ``sink[label]``.
    """
    orig = client.api._request

    async def _capture(method: str, endpoint: str, *args: Any, **kwargs: Any):
        if "extend" in endpoint:
            sink[label] = {
                "method": method,
                "endpoint": endpoint,
                "payload": kwargs.get("json"),
            }
        return await orig(method, endpoint, *args, **kwargs)

    client.api._request = _capture
    return orig


class PixverseExtendLastFrameDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="pixverse-extend-last-frame",
        label="Pixverse extend · last-frame plumbing",
        description=(
            "Verify last_frame_url reaches the Pixverse OpenAPI /video/extend "
            "payload (as customer_video_last_frame_url). Single mode submits "
            "one instrumented extend; A/B mode submits with/without "
            "last_frame_url in parallel for comparison. Hits the live "
            "Pixverse API and costs extend credits."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="openapi_key",
                kind="string",
                label="Pixverse OpenAPI key",
                default="",
                required=True,
                description="OpenAPI key for the account that owns the source video.",
            ),
            DiagnosticParam(
                name="source_spec",
                kind="string",
                label="Source spec",
                default="",
                required=True,
                description="'asset:<N>' (pixsim asset id) or 'video:<id>' (raw Pixverse video_id).",
            ),
            DiagnosticParam(
                name="prompt",
                kind="string",
                label="Prompt",
                default=_DEFAULT_PROMPT,
                description="Extend prompt. Defaults to a neutral 'scene continues' line.",
            ),
            DiagnosticParam(
                name="ab_mode",
                kind="bool",
                label="A/B (with vs without last_frame_url)",
                default=False,
                description="Submit two extends in parallel for comparison. Costs two credits.",
            ),
            DiagnosticParam(
                name="model",
                kind="string",
                label="Model",
                default="v6",
            ),
            DiagnosticParam(
                name="quality",
                kind="string",
                label="Quality",
                default="360p",
            ),
            DiagnosticParam(
                name="duration",
                kind="int",
                label="Duration (s)",
                default=5,
            ),
            DiagnosticParam(
                name="poll_interval_s",
                kind="float",
                label="Poll interval (s)",
                default=2.0,
            ),
            DiagnosticParam(
                name="max_poll_minutes",
                kind="float",
                label="Max poll (min)",
                default=6.0,
            ),
        ),
    )

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        # The work happens in a background coroutine that pushes events onto
        # a queue — this lets A/B mode poll two videos concurrently while we
        # still yield events from a single generator.
        q: asyncio.Queue[Any] = asyncio.Queue()
        worker = asyncio.create_task(
            self._drive(params, cancel_event, q),
            name="pixverse-extend-last-frame-driver",
        )
        try:
            while True:
                item = await q.get()
                if item is _DONE:
                    break
                yield item
        finally:
            if not worker.done():
                worker.cancel()
            await asyncio.gather(worker, return_exceptions=True)

    async def _drive(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
        q: asyncio.Queue,
    ) -> None:
        loop = asyncio.get_event_loop()
        t0 = loop.time()

        def now() -> float:
            return loop.time() - t0

        async def emit(type_: str, payload: dict[str, Any]) -> None:
            await q.put(DiagnosticEvent(now(), type_, payload))

        async def log(message: str, level: str = "info") -> None:
            await emit("log", {"level": level, "message": message})

        try:
            openapi_key = str(params.get("openapi_key") or "").strip()
            source_spec = str(params.get("source_spec") or "").strip()
            prompt = str(params.get("prompt") or _DEFAULT_PROMPT).strip() or _DEFAULT_PROMPT
            ab_mode = bool(params.get("ab_mode"))
            model = str(params.get("model") or "v6")
            quality = str(params.get("quality") or "360p")
            duration = int(params.get("duration") or 5)
            poll_interval = max(0.5, float(params.get("poll_interval_s") or 2.0))
            max_poll_minutes = max(0.5, float(params.get("max_poll_minutes") or 6.0))

            if not openapi_key:
                await emit("error", {"message": "OpenAPI key is required."})
                return
            if not source_spec:
                await emit("error", {"message": "Source spec is required (asset:<N> or video:<id>)."})
                return

            # Imports are local so a missing/relocated SDK can't break module
            # import (and registry registration) for every other diagnostic.
            try:
                from pixverse import GenerationOptions, PixverseClient
                from pixverse.accounts import AccountPool
            except Exception as exc:  # noqa: BLE001
                await emit("error", {"message": f"Pixverse SDK import failed: {exc}"})
                return

            # ── Phase: init ────────────────────────────────────────────────
            await emit("phase", {"phase": "init"})
            await log("Building OpenAPI-only Pixverse client…")
            pool = AccountPool(
                accounts=[
                    {
                        "email": "openapi-test",
                        "password": None,
                        "session": {"openapi_key": openapi_key, "use_method": "open-api"},
                    }
                ]
            )
            client = PixverseClient(account_pool=pool)
            sdk_account = pool.accounts[0]

            await log(f"Resolving source spec: {source_spec}")
            source_video_id = await self._resolve_source_video_id(source_spec, emit)
            if source_video_id is None:
                return  # _resolve already emitted an error
            await log(f"Source video_id = {source_video_id}")
            await emit("transition", {"key": "t_source_resolved", "value": now(), "video_id": source_video_id})

            await log("Fetching source last-frame URL…")
            last_frame = await self._fetch_source_thumb(client, source_video_id, emit)
            if not last_frame:
                await emit(
                    "error",
                    {
                        "message": (
                            f"Source video {source_video_id} has no thumbnail/last-frame "
                            "URL — not available on this account, or Pixverse didn't "
                            "populate the thumbnail field."
                        )
                    },
                )
                return
            await log(f"last_frame_url = {last_frame}")
            await emit("transition", {"key": "t_last_frame_fetched", "value": now()})

            if cancel_event.is_set():
                return

            captured: dict = {}
            opts = GenerationOptions(model=model, quality=quality, duration=duration)

            # Each entry: (label, last_frame_url_or_None)
            jobs: list[tuple[str, Optional[str]]] = (
                [("with_last_frame", last_frame), ("without_last_frame", None)]
                if ab_mode
                else [("with_last_frame", last_frame)]
            )

            # ── Phase: submitting ──────────────────────────────────────────
            await emit("phase", {"phase": "submitting"})
            if ab_mode:
                await log("A/B mode: submitting 2 extends in parallel (2 credits).")

            submit_results = await asyncio.gather(
                *(
                    self._submit_extend(
                        client, sdk_account, source_video_id, lf, prompt, label,
                        opts, captured, emit, now,
                    )
                    for label, lf in jobs
                ),
                return_exceptions=True,
            )

            new_ids: dict[str, str] = {}
            for (label, _), res in zip(jobs, submit_results):
                if isinstance(res, Exception):
                    await emit("error", {"message": f"[{label}] submit failed: {res}"})
                    continue
                new_ids[label] = res

            if not new_ids:
                await emit("error", {"message": "No extend submissions succeeded."})
                return
            await emit("transition", {"key": "t_submitted", "value": now()})

            if cancel_event.is_set():
                return

            # ── Phase: polling ─────────────────────────────────────────────
            await emit("phase", {"phase": "polling"})
            poll_results = await asyncio.gather(
                *(
                    self._poll_until_terminal(
                        client, vid, label, emit, now,
                        cancel_event, poll_interval, max_poll_minutes,
                    )
                    for label, vid in new_ids.items()
                ),
                return_exceptions=True,
            )

            # ── Phase: done + summary ──────────────────────────────────────
            await emit("phase", {"phase": "done"})
            rows: list[dict[str, Any]] = []
            for (label, vid), res in zip(new_ids.items(), poll_results):
                cap = captured.get(label) or {}
                payload = cap.get("payload") if isinstance(cap, dict) else None
                has_lf = isinstance(payload, dict) and "customer_video_last_frame_url" in payload
                final = None if isinstance(res, Exception) else res
                rows.append(
                    {
                        "label": label,
                        "new_video_id": vid,
                        "endpoint": cap.get("endpoint") if isinstance(cap, dict) else None,
                        "last_frame_url_in_payload": bool(has_lf),
                        "last_frame_url_value": (
                            payload.get("customer_video_last_frame_url") if has_lf else None
                        ),
                        "final_status": getattr(final, "status", None) if final is not None else None,
                        "final_url": getattr(final, "url", None) if final is not None else None,
                        "error": str(res) if isinstance(res, Exception) else None,
                    }
                )

            await emit(
                "summary",
                {
                    "mode": "ab" if ab_mode else "single",
                    "source_video_id": source_video_id,
                    "prompt": prompt,
                    "model": model,
                    "quality": quality,
                    "duration": duration,
                    "rows": rows,
                },
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — surface, never crash the run loop
            logger.exception("pixverse-extend-last-frame diagnostic errored")
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            await q.put(_DONE)

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _resolve_source_video_id(self, spec: str, emit) -> Optional[str]:
        """Turn 'asset:<N>' / 'video:<id>' / bare digit into a Pixverse video_id."""
        if spec.startswith("video:"):
            rest = spec.split(":", 1)[1].strip()
            if not rest:
                await emit("error", {"message": "video: spec missing an id"})
                return None
            return rest
        if spec.startswith("asset:"):
            inner = spec.split(":", 1)[1].strip()
            if not inner.isdigit():
                await emit("error", {"message": f"asset: spec requires numeric id, got '{inner}'"})
                return None
            asset_id = int(inner)
            from sqlalchemy import select

            from pixsim7.backend.main.domain import Asset
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                row = (
                    await session.execute(select(Asset).where(Asset.id == asset_id))
                ).scalar_one_or_none()
            if not row:
                await emit("error", {"message": f"Asset {asset_id} not found in pixsim7 DB"})
                return None
            paid = str(getattr(row, "provider_asset_id", "") or "").strip()
            if paid.isdigit():
                return paid
            pu = (row.provider_uploads or {}).get("pixverse")
            if isinstance(pu, dict):
                pu = pu.get("id")
            if isinstance(pu, str) and pu.isdigit():
                return pu
            await emit(
                "error",
                {
                    "message": (
                        f"Asset {asset_id} has no Pixverse video_id "
                        "(provider_asset_id / provider_uploads['pixverse'] empty)."
                    )
                },
            )
            return None
        if spec.isdigit():
            return spec
        await emit("error", {"message": f"Bad source spec '{spec}' — use asset:<N> or video:<id>."})
        return None

    async def _fetch_source_thumb(self, client: Any, video_id: str, emit) -> Optional[str]:
        try:
            video = await client.get_video(video_id=video_id)
        except Exception as exc:  # noqa: BLE001
            await emit("error", {"message": f"get_video({video_id}) failed: {exc}"})
            return None
        url = getattr(video, "thumbnail", None)
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            return None
        return url

    async def _submit_extend(
        self,
        client: Any,
        sdk_account: Any,
        source_video_id: str,
        last_frame_url: Optional[str],
        prompt: str,
        label: str,
        opts: Any,
        captured: dict,
        emit,
        now,
    ) -> str:
        """Submit one extend; returns the new video_id."""
        if last_frame_url:
            video_arg: Any = {
                "original_video_id": source_video_id,
                "last_frame_url": last_frame_url,
            }
        else:
            video_arg = f"video_id:{source_video_id}"

        orig = _install_request_capture(client, label, captured)
        try:
            video = await client.api.extend_video(
                video_url=video_arg,
                prompt=prompt,
                options=opts,
                account=sdk_account,
            )
        finally:
            client.api._request = orig

        new_id = str(getattr(video, "id", "") or "")
        if not new_id:
            raise RuntimeError(f"[{label}] extend response missing video id")

        cap = captured.get(label) or {}
        payload = cap.get("payload") if isinstance(cap, dict) else None
        has_lf = isinstance(payload, dict) and "customer_video_last_frame_url" in payload
        await emit(
            "observation",
            {
                "source": "extend_submit",
                "label": label,
                "new_video_id": new_id,
                "endpoint": cap.get("endpoint") if isinstance(cap, dict) else None,
                "last_frame_url_in_payload": bool(has_lf),
                "payload": _safe_payload(payload),
            },
        )
        return new_id

    async def _poll_until_terminal(
        self,
        client: Any,
        video_id: str,
        label: str,
        emit,
        now,
        cancel_event: asyncio.Event,
        poll_interval: float,
        max_poll_minutes: float,
    ) -> Any:
        """Poll get_video until terminal; emit an observation on each status change."""
        deadline = time.monotonic() + max_poll_minutes * 60
        last_status: Optional[str] = None
        while time.monotonic() < deadline:
            if cancel_event.is_set():
                await emit("log", {"level": "warning", "message": f"[{label}] cancelled mid-poll"})
                return None
            try:
                await asyncio.wait_for(cancel_event.wait(), timeout=poll_interval)
                # cancel fired during the wait
                await emit("log", {"level": "warning", "message": f"[{label}] cancelled mid-poll"})
                return None
            except asyncio.TimeoutError:
                pass

            try:
                v = await client.get_video(video_id=video_id)
            except Exception as exc:  # noqa: BLE001
                await emit("log", {"level": "warning", "message": f"[{label}] get_video error: {exc}"})
                continue
            status = getattr(v, "status", None)
            if status != last_status:
                await emit(
                    "observation",
                    {
                        "source": "poll",
                        "label": label,
                        "video_id": video_id,
                        "status": status,
                        "url": getattr(v, "url", None),
                    },
                )
                last_status = status
            if status in _TERMINAL_STATES:
                await emit("transition", {"key": f"t_terminal_{label}", "value": now()})
                return v
        await emit("log", {"level": "warning", "message": f"[{label}] timed out after {max_poll_minutes}min"})
        return None


def _safe_payload(payload: Any) -> Any:
    """Round-trip the captured payload through JSON so it's wire-safe."""
    if payload is None:
        return None
    try:
        return json.loads(json.dumps(payload, default=str))
    except Exception:  # noqa: BLE001
        return repr(payload)
