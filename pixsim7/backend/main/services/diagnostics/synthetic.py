"""Placeholder diagnostic used to validate the framework end-to-end.

Emits a phased fake observation timeline over ~6 seconds — same event
vocabulary the early-CDN diagnostic will use, so the frontend
DiagnosticRunner can be developed and demoed without coupling to a real
provider.

Replace or supplement once the real diagnostics (early-CDN webapi/openapi)
are ported into the registry.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any, AsyncIterator

from .base import Diagnostic, DiagnosticEvent, DiagnosticParam, DiagnosticSpec


class SyntheticDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="synthetic",
        label="Synthetic timeline",
        description=(
            "Emits a fake phased timeline over ~6s. Useful for verifying "
            "the diagnostic runner UI without hitting an external provider."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="duration_s",
                kind="float",
                label="Total duration (s)",
                default=6.0,
                description="How long the synthetic run takes end-to-end.",
            ),
            DiagnosticParam(
                name="seed",
                kind="int",
                label="Random seed",
                default=0,
                description="Determines synthetic jitter; 0 means use system entropy.",
            ),
        ),
    )

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        loop = asyncio.get_event_loop()
        t0 = loop.time()
        duration = float(params.get("duration_s") or 6.0)
        seed = int(params.get("seed") or 0)
        rng = random.Random(seed) if seed else random.Random()

        def now() -> float:
            return loop.time() - t0

        async def wait(seconds: float) -> bool:
            """Sleep up to `seconds`; return True if cancelled mid-wait."""
            try:
                await asyncio.wait_for(cancel_event.wait(), timeout=seconds)
                return True
            except asyncio.TimeoutError:
                return False

        # Phase: submitting (10% of total)
        yield DiagnosticEvent(t_rel=now(), type="phase", payload={"phase": "submitting"})
        if await wait(duration * 0.10):
            return

        # Phase: polling (70% of total) — emits observations + transitions
        yield DiagnosticEvent(t_rel=now(), type="phase", payload={"phase": "polling"})

        first_real_at: float | None = None
        placeholder_at: float | None = None
        ticks = max(4, int(duration * 4))  # ~4 observations/second
        per_tick = (duration * 0.70) / ticks

        for i in range(ticks):
            if await wait(per_tick):
                return
            t_rel = now()
            # Synthesize a "real URL appears at ~30%, swaps to placeholder at ~85%"
            ratio = i / max(1, ticks - 1)
            url_is_retrievable = 0.30 <= ratio < 0.85
            url_is_placeholder = ratio >= 0.85
            url = (
                f"https://media.example/openapi/output/synthetic-{rng.randint(1000, 9999)}.mp4"
                if url_is_retrievable or url_is_placeholder
                else None
            )
            yield DiagnosticEvent(
                t_rel=t_rel,
                type="observation",
                payload={
                    "source": "get_video" if i % 2 == 0 else "list_videos",
                    "raw_status": 5 if ratio < 0.9 else 1,
                    "url": url,
                    "url_is_retrievable": url_is_retrievable,
                    "url_is_placeholder": url_is_placeholder,
                    "width": 360 if url_is_retrievable or url_is_placeholder else 0,
                    "height": 640 if url_is_retrievable or url_is_placeholder else 0,
                },
            )
            if url_is_retrievable and first_real_at is None:
                first_real_at = t_rel
                yield DiagnosticEvent(
                    t_rel=t_rel,
                    type="transition",
                    payload={"key": "t_first_real_get", "value": t_rel},
                )
            if url_is_placeholder and placeholder_at is None:
                placeholder_at = t_rel
                yield DiagnosticEvent(
                    t_rel=t_rel,
                    type="transition",
                    payload={"key": "t_placeholder_get", "value": t_rel},
                )

        # Phase: post-terminal (20% of total)
        yield DiagnosticEvent(t_rel=now(), type="phase", payload={"phase": "post_terminal"})
        if await wait(duration * 0.20):
            return

        # Summary
        window: float | None = None
        if first_real_at is not None and placeholder_at is not None:
            window = placeholder_at - first_real_at
        yield DiagnosticEvent(
            t_rel=now(),
            type="summary",
            payload={
                "t_first_real_get": first_real_at,
                "t_placeholder_get": placeholder_at,
                "window_s": window,
                "note": "Synthetic data — no real CDN observed.",
            },
        )
