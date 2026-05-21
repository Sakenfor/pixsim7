"""Early-CDN window diagnostic (WebAPI variant).

Backend port of ``tests/manual_test_early_cdn.py``.  Measures Pixverse's
early-CDN window: how long a real ``/openapi/output/`` URL is advertised
before it swaps to a ``/default.mp4`` placeholder, and how long the real
file actually stays fetchable (200 → 404).

Submits an image-to-video job, then polls ``get_video`` AND
``list_videos`` on a fast cadence while a parallel task HEAD-probes the
most recent real CDN URL.  Records a transition timeline:

    t_first_real_get / t_first_real_list   first retrievable URL per source
    t_placeholder_get / t_placeholder_list first /default.mp4 per source
    t_404                                   first HEAD probe that 404'd
    t_first_thumbnail_get / _list           first real last-frame URL
    window        = t_placeholder − t_first_real (catch budget)
    cdn_lifespan  = t_404 − earliest_real        (file uptime)

Two modes:

* ``flagged``  — suggestive prompt/image expected to trip moderation
  (observational: watch the real-URL → placeholder swap on a FILTERED job).
* ``benign``   — happy-path prompt expected to COMPLETE; the summary adds
  a pass/fail assertion (terminal == completed AND a retrievable URL seen).

Auth is WebAPI: either ``account:<id>`` (loads the stored JWT+cookies
session from the pixsim7 DB) or ``email:password`` (live login).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from .base import (
    Diagnostic,
    DiagnosticEvent,
    DiagnosticParam,
    DiagnosticSpec,
    parse_select_float,
)

logger = logging.getLogger(__name__)

# Sentinel pushed by the driver coroutine onto the internal event queue.
_DONE = object()

# Pixverse raw status code groupings (mirrors the manual test + SDK).
_COMPLETED_CODES = (1,)
_FILTERED_CODES = (3, 7, 17)
_FAILED_CODES = (-1, 4, 8, 9)

_MODE_PRESETS: dict[str, dict[str, Any]] = {
    "flagged": {
        "image_url": (
            "https://media.pixverse.ai/openapi/"
            "22b41e80-1002-4905-8817-afeb66bbdcc2_"
            "cca85883542dc195891af14f093f74ba_auto.jpg"
        ),
        "prompt": "ACTIONS = SHE DANCES WILDLY, FIGURE 8 STRIPPER STYLE, BACK TO CAMERA",
        "model": "v6",
        "duration": 5,
    },
    "benign": {
        "image_url": (
            "https://media.pixverse.ai/pixverse/i2i/ori/"
            "6eac1a42-f0b3-4649-a3db-a13f3ef66b8f.png"
        ),
        "prompt": "They solve puzzle",
        "model": "v6",
        "duration": 1,
    },
}


@dataclass
class _Timeline:
    """Transition-timestamp tracker — same fields as the manual test."""

    t_first_real_get: Optional[float] = None
    t_first_real_list: Optional[float] = None
    t_placeholder_get: Optional[float] = None
    t_placeholder_list: Optional[float] = None
    t_404: Optional[float] = None
    t_first_thumbnail_get: Optional[float] = None
    t_first_thumbnail_list: Optional[float] = None
    last_real_url: Optional[str] = None
    unique_thumbnails: list[str] = field(default_factory=list)
    first_webp_url: Optional[str] = None
    t_first_webp: Optional[float] = None
    webp_head_status: Optional[int] = None
    t_webp_head: Optional[float] = None

    # --- transition fields surfaced as `transition` events (in declared order) ---
    _TRANSITION_FIELDS = (
        "t_first_real_get",
        "t_first_real_list",
        "t_placeholder_get",
        "t_placeholder_list",
        "t_404",
        "t_first_thumbnail_get",
        "t_first_thumbnail_list",
    )

    def record_poll(
        self,
        *,
        source: str,
        t_rel: float,
        url_is_retrievable: bool,
        url_is_placeholder: bool,
        url: Optional[str],
        thumbnail_url: Optional[str],
    ) -> None:
        if url_is_retrievable:
            if source == "get_video" and self.t_first_real_get is None:
                self.t_first_real_get = t_rel
            if source == "list_videos" and self.t_first_real_list is None:
                self.t_first_real_list = t_rel
            if url:
                self.last_real_url = url
        if url_is_placeholder:
            if source == "get_video" and self.t_placeholder_get is None:
                self.t_placeholder_get = t_rel
            if source == "list_videos" and self.t_placeholder_list is None:
                self.t_placeholder_list = t_rel
        if thumbnail_url and thumbnail_url.startswith(("http://", "https://")):
            if thumbnail_url not in self.unique_thumbnails:
                self.unique_thumbnails.append(thumbnail_url)
            if source == "get_video" and self.t_first_thumbnail_get is None:
                self.t_first_thumbnail_get = t_rel
            if source == "list_videos" and self.t_first_thumbnail_list is None:
                self.t_first_thumbnail_list = t_rel

    def record_head(self, *, t_rel: float, http_status: Optional[int]) -> None:
        if http_status and http_status >= 400 and self.t_404 is None:
            self.t_404 = t_rel


def _extract_fields(v: Any) -> dict:
    """Extract status/url/dims from a pydantic-ish object or a dict."""
    if v is None:
        return {}
    if isinstance(v, dict):
        raw_status = v.get("video_status") or v.get("status")
        url = v.get("url") or v.get("video_url")
        thumb = v.get("first_frame") or v.get("thumbnail") or v.get("thumbnail_url")
        width = v.get("output_width") or v.get("width")
        height = v.get("output_height") or v.get("height")
        webp = v.get("webp_url")
    else:
        raw_status = getattr(v, "video_status", None) or getattr(v, "status", None)
        url = getattr(v, "url", None) or getattr(v, "video_url", None)
        thumb = getattr(v, "first_frame", None) or getattr(v, "thumbnail", None)
        width = getattr(v, "output_width", None) or getattr(v, "width", None)
        height = getattr(v, "output_height", None) or getattr(v, "height", None)
        webp = getattr(v, "webp_url", None)
    return {
        "raw_status": raw_status,
        "url": url,
        "thumb": thumb,
        "width": width,
        "height": height,
        "webp": webp,
    }


class EarlyCdnWebapiDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="early-cdn-webapi",
        label="Pixverse early-CDN window (WebAPI)",
        description=(
            "Measure Pixverse's early-CDN window via WebAPI: submit an i2v "
            "job, fast-poll get_video + list_videos while HEAD-probing the "
            "real CDN URL, and time the real→placeholder swap + 200→404 "
            "lifespan. 'flagged' mode is observational (moderation); 'benign' "
            "mode adds a happy-path pass/fail assertion. Hits the live "
            "Pixverse API and costs one generation credit."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="account",
                kind="string",
                label="Account",
                default="",
                required=True,
                description="'account:<id>' (stored JWT session from pixsim DB) or 'email:password'.",
            ),
            DiagnosticParam(
                name="mode",
                kind="select",
                label="Mode",
                default="flagged",
                options=["flagged", "benign"],
                description="flagged = moderation observational; benign = happy-path assertion.",
            ),
            DiagnosticParam(
                name="prompt",
                kind="string",
                label="Prompt override",
                default="",
                description="Blank uses the mode preset prompt.",
            ),
            DiagnosticParam(
                name="image_url",
                kind="string",
                label="Source image URL override",
                default="",
                description="Blank uses the mode preset image.",
            ),
            DiagnosticParam(
                name="model",
                kind="string",
                label="Model override",
                default="",
                description="Blank uses the mode preset model (v6). Quality auto-derived.",
            ),
            DiagnosticParam(
                name="duration",
                kind="int",
                label="Duration override (s)",
                default=0,
                description="0 uses the mode preset duration. Clamped to model max.",
            ),
            DiagnosticParam(
                name="poll_interval_s",
                kind="select",
                label="Poll interval (s)",
                default="0.25 — fast (resolve sub-second window)",
                options=[
                    "0.25 — fast (resolve sub-second window)",
                    "0.5 — moderate",
                    "1 — gentle",
                    "2 — slow",
                ],
                description="Fast cadence catches a short real→placeholder window.",
            ),
            DiagnosticParam(
                name="head_probe_interval_s",
                kind="select",
                label="HEAD probe interval (s)",
                default="0.5 — default",
                options=["0.25 — aggressive (tighter t_404)", "0.5 — default", "1 — light"],
                description="How often the parallel task HEAD-probes the real CDN URL.",
            ),
            DiagnosticParam(
                name="max_poll_minutes",
                kind="select",
                label="Max poll (min)",
                default="6 — default",
                options=["3 — quick", "6 — default", "10 — patient"],
                description="Give up polling the job after this long.",
            ),
            DiagnosticParam(
                name="post_terminal_probe_s",
                kind="select",
                label="Post-terminal probe (s)",
                default="60 — default",
                options=["30 — short", "60 — default", "120 — long (catch very late thumbnails)"],
                description="After terminal, keep watching for a late thumbnail (skipped if filtered).",
            ),
        ),
    )

    async def run(
        self,
        params: dict[str, Any],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[DiagnosticEvent]:
        q: asyncio.Queue[Any] = asyncio.Queue()
        worker = asyncio.create_task(
            self._drive(params, cancel_event, q),
            name="early-cdn-webapi-driver",
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

        # t0 is reset to the submit-response time so all transition timings
        # are relative to "job accepted" — matches the manual test.
        t0_holder = {"t0": loop.time()}

        def now() -> float:
            return loop.time() - t0_holder["t0"]

        async def emit(type_: str, payload: dict[str, Any]) -> None:
            await q.put(DiagnosticEvent(now(), type_, payload))

        async def log(message: str, level: str = "info") -> None:
            await emit("log", {"level": level, "message": message})

        emitted_transitions: set[str] = set()

        async def emit_new_transitions(tl: _Timeline) -> None:
            for fname in _Timeline._TRANSITION_FIELDS:
                if fname in emitted_transitions:
                    continue
                val = getattr(tl, fname)
                if val is not None:
                    emitted_transitions.add(fname)
                    await emit("transition", {"key": fname, "value": val})

        try:
            account_spec = str(params.get("account") or "").strip()
            mode = str(params.get("mode") or "flagged").strip().lower()
            if mode not in _MODE_PRESETS:
                await emit("error", {"message": f"Unknown mode '{mode}' (use flagged|benign)"})
                return
            if not account_spec:
                await emit("error", {"message": "Account is required (account:<id> or email:password)."})
                return

            preset = _MODE_PRESETS[mode]
            prompt = str(params.get("prompt") or "").strip() or preset["prompt"]
            image_url = str(params.get("image_url") or "").strip() or preset["image_url"]
            model = str(params.get("model") or "").strip() or preset["model"]
            duration = int(params.get("duration") or 0) or preset["duration"]
            poll_interval = max(0.1, parse_select_float(params.get("poll_interval_s"), 0.25))
            head_interval = max(0.1, parse_select_float(params.get("head_probe_interval_s"), 0.5))
            max_poll_minutes = max(0.5, parse_select_float(params.get("max_poll_minutes"), 6.0))
            post_terminal_s = max(0.0, parse_select_float(params.get("post_terminal_probe_s"), 60.0))

            # Local imports — keep registry import resilient to SDK changes.
            try:
                import httpx
                from pixverse import PixverseClient
                from pixverse.models import VideoModel
                from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
                    has_retrievable_pixverse_media_url,
                    is_pixverse_placeholder_url,
                    normalize_url,
                )
            except Exception as exc:  # noqa: BLE001
                await emit("error", {"message": f"Import failed: {exc}"})
                return

            spec = VideoModel.get(model)
            quality = spec.qualities[0] if spec else "360p"
            if spec and duration > spec.max_duration:
                duration = spec.max_duration

            def classify_url(url: Optional[str]) -> tuple[bool, bool]:
                if not url:
                    return False, False
                return is_pixverse_placeholder_url(url), has_retrievable_pixverse_media_url(url)

            # ── Phase: init ────────────────────────────────────────────────
            await emit("phase", {"phase": "init"})
            client = await self._build_client(account_spec, PixverseClient, log, emit)
            if client is None:
                return

            if cancel_event.is_set():
                return

            # ── Phase: submitting ──────────────────────────────────────────
            await emit("phase", {"phase": "submitting"})
            await log(
                f"Submitting i2v job (mode={mode}, model={model}, quality={quality}, dur={duration}s)…"
            )
            try:
                video = await client.create(
                    prompt=prompt,
                    image_url=image_url,
                    model=model,
                    duration=duration,
                    quality=quality,
                    audio=False,
                )
            except Exception as exc:  # noqa: BLE001
                await emit("error", {"message": f"submit failed: {type(exc).__name__}: {exc}"})
                return
            job_id = str(getattr(video, "id", "") or "")
            if not job_id:
                await emit("error", {"message": "submit response missing job id"})
                return
            t0_holder["t0"] = loop.time()  # reset clock to submit-accepted
            await log(f"Submitted — job_id={job_id}; clock reset.")
            await emit("transition", {"key": "t_submit", "value": 0.0, "job_id": job_id})

            timeline = _Timeline()
            stop_event = asyncio.Event()
            seen_get: list[str] = []
            seen_list: list[str] = []

            # ── Phase: polling ─────────────────────────────────────────────
            await emit("phase", {"phase": "polling"})

            async with httpx.AsyncClient(
                timeout=5.0,
                follow_redirects=True,
                headers={"User-Agent": "PixSim7-EarlyCDN-Probe/1.0"},
            ) as http_client:

                async def head_probe_monitor() -> None:
                    last_probed: Optional[str] = None
                    while not stop_event.is_set() and not cancel_event.is_set():
                        try:
                            await asyncio.wait_for(stop_event.wait(), timeout=head_interval)
                        except asyncio.TimeoutError:
                            pass
                        url = timeline.last_real_url
                        if not url:
                            continue
                        try:
                            r = await http_client.head(url)
                            status = r.status_code
                        except Exception as exc:  # noqa: BLE001
                            status = None
                            await emit(
                                "observation",
                                {"source": "head_probe", "http_status": None,
                                 "url": url, "error": str(exc)[:120]},
                            )
                            continue
                        t_rel = now()
                        note = "same_url" if url == last_probed else "new_url"
                        last_probed = url
                        timeline.record_head(t_rel=t_rel, http_status=status)
                        await emit(
                            "observation",
                            {"source": "head_probe", "http_status": status,
                             "url": url, "note": note},
                        )
                        await emit_new_transitions(timeline)

                probe_task = asyncio.create_task(head_probe_monitor(), name="early-cdn-head-probe")

                terminal = False
                terminal_kind: Optional[str] = None
                deadline = loop.time() + max_poll_minutes * 60

                try:
                    while loop.time() < deadline:
                        if cancel_event.is_set():
                            await log("cancelled mid-poll", level="warning")
                            break
                        await asyncio.sleep(poll_interval)
                        t_rel = now()

                        gv_result, lv_result = await asyncio.gather(
                            self._try_get_video(client, job_id, emit),
                            self._try_list_videos(client, job_id, emit),
                        )

                        for source, payload, seen in (
                            ("get_video", gv_result, seen_get),
                            ("list_videos", lv_result, seen_list),
                        ):
                            fields = _extract_fields(payload)
                            if not fields:
                                continue
                            status_str = str(fields["raw_status"])
                            if status_str not in seen:
                                seen.append(status_str)
                            is_ph, is_ret = classify_url(fields["url"])
                            thumb_raw = fields.get("thumb")
                            thumb_is_ph = is_pixverse_placeholder_url(thumb_raw) if thumb_raw else False
                            thumb_is_real = bool(thumb_raw) and not thumb_is_ph
                            timeline.record_poll(
                                source=source,
                                t_rel=t_rel,
                                url_is_retrievable=is_ret,
                                url_is_placeholder=is_ph,
                                url=fields["url"],
                                thumbnail_url=thumb_raw if thumb_is_real else None,
                            )
                            await emit(
                                "observation",
                                {
                                    "source": source,
                                    "raw_status": fields["raw_status"],
                                    "url": fields["url"],
                                    "url_is_retrievable": is_ret,
                                    "url_is_placeholder": is_ph,
                                    "thumb_is_real": thumb_is_real,
                                    "thumb_is_placeholder": thumb_is_ph,
                                    "width": fields["width"],
                                    "height": fields["height"],
                                },
                            )
                            await emit_new_transitions(timeline)

                            webp = fields.get("webp")
                            if webp and timeline.first_webp_url is None:
                                timeline.first_webp_url = webp
                                timeline.t_first_webp = t_rel
                                await emit("transition", {"key": "t_first_webp", "value": t_rel})
                                try:
                                    wr = await http_client.head(webp)
                                    timeline.webp_head_status = wr.status_code
                                except Exception:  # noqa: BLE001
                                    timeline.webp_head_status = None
                                timeline.t_webp_head = now()
                                await emit(
                                    "observation",
                                    {"source": "webp_head", "http_status": timeline.webp_head_status,
                                     "url": webp},
                                )

                        gv_fields = _extract_fields(gv_result)
                        gv_status = gv_fields.get("raw_status")
                        if isinstance(gv_status, int):
                            if gv_status in _COMPLETED_CODES or (
                                gv_status == 10 and gv_fields.get("width") and gv_fields.get("height")
                            ):
                                terminal, terminal_kind = True, "completed"
                            elif gv_status in _FILTERED_CODES:
                                terminal, terminal_kind = True, "filtered"
                            elif gv_status in _FAILED_CODES:
                                terminal, terminal_kind = True, "failed"
                            if terminal:
                                await log(f"=== get_video {terminal_kind.upper()} (raw={gv_status}) ===")
                                await emit("transition", {"key": "t_terminal", "value": t_rel,
                                                          "kind": terminal_kind})
                                break

                    was_filtered = terminal_kind == "filtered" or any(
                        s.lstrip("-").isdigit() and int(s) in _FILTERED_CODES
                        for s in (seen_get + seen_list)
                    )

                    # ── Phase: post_terminal (skip for filtered) ────────────
                    if (timeline.last_real_url or terminal) and not was_filtered and not cancel_event.is_set():
                        await emit("phase", {"phase": "post_terminal"})
                        await log(
                            f"Post-terminal monitoring up to {post_terminal_s:.0f}s — watching for a late thumbnail…"
                        )
                        post_deadline = loop.time() + post_terminal_s
                        thumb_seen = bool(timeline.unique_thumbnails)
                        while loop.time() < post_deadline and not cancel_event.is_set():
                            await asyncio.sleep(2.0)
                            t_rel = now()
                            gv, lv = await asyncio.gather(
                                self._try_get_video(client, job_id, emit),
                                self._try_list_videos(client, job_id, emit),
                            )
                            for src, payload in (("get_video", gv), ("list_videos", lv)):
                                f = _extract_fields(payload)
                                if not f:
                                    continue
                                is_ph, is_ret = classify_url(f.get("url"))
                                thumb_raw = f.get("thumb")
                                thumb_is_ph = is_pixverse_placeholder_url(thumb_raw) if thumb_raw else False
                                thumb_is_real = bool(thumb_raw) and not thumb_is_ph
                                timeline.record_poll(
                                    source=src,
                                    t_rel=t_rel,
                                    url_is_retrievable=is_ret,
                                    url_is_placeholder=is_ph,
                                    url=f.get("url"),
                                    thumbnail_url=thumb_raw if thumb_is_real else None,
                                )
                                await emit_new_transitions(timeline)
                                if thumb_is_real and not thumb_seen:
                                    await log(f"POST-TERMINAL real thumbnail via {src}: {thumb_raw}")
                                    thumb_seen = True
                            if thumb_seen:
                                break
                    elif was_filtered:
                        await log(
                            "Skipping post-terminal monitoring — FILTERED job has no real last-frame URL."
                        )
                finally:
                    stop_event.set()
                    await asyncio.gather(probe_task, return_exceptions=True)

            # ── Phase: done + summary ──────────────────────────────────────
            await emit("phase", {"phase": "done"})

            first_real_candidates = [
                t for t in (timeline.t_first_real_get, timeline.t_first_real_list) if t is not None
            ]
            earliest_real = min(first_real_candidates) if first_real_candidates else None
            get_window = (
                timeline.t_placeholder_get - timeline.t_first_real_get
                if timeline.t_first_real_get is not None and timeline.t_placeholder_get is not None
                else None
            )
            list_window = (
                timeline.t_placeholder_list - timeline.t_first_real_list
                if timeline.t_first_real_list is not None and timeline.t_placeholder_list is not None
                else None
            )
            cdn_lifespan = (
                timeline.t_404 - earliest_real
                if earliest_real is not None and timeline.t_404 is not None
                else None
            )

            summary: dict[str, Any] = {
                "mode": mode,
                "job_id": job_id,
                "model": model,
                "quality": quality,
                "duration": duration,
                "terminal_kind": terminal_kind,
                "get_video_statuses": seen_get,
                "list_videos_statuses": seen_list,
                "t_first_real_get": timeline.t_first_real_get,
                "t_first_real_list": timeline.t_first_real_list,
                "t_placeholder_get": timeline.t_placeholder_get,
                "t_placeholder_list": timeline.t_placeholder_list,
                "t_404": timeline.t_404,
                "t_first_thumbnail_get": timeline.t_first_thumbnail_get,
                "t_first_thumbnail_list": timeline.t_first_thumbnail_list,
                "get_video_window_s": get_window,
                "list_videos_window_s": list_window,
                "cdn_lifespan_s": cdn_lifespan,
                "unique_thumbnails": list(timeline.unique_thumbnails),
                "first_webp_url": timeline.first_webp_url,
                "webp_head_status": timeline.webp_head_status,
            }

            # Benign mode = happy-path assertion.
            if mode == "benign":
                passed = terminal_kind == "completed" and earliest_real is not None
                summary["assertion"] = {
                    "expected": "completed + retrievable URL observed",
                    "terminal_kind": terminal_kind,
                    "retrievable_url_seen": earliest_real is not None,
                    "passed": passed,
                }
                if not passed:
                    await emit(
                        "log",
                        {"level": "warning",
                         "message": f"benign assertion FAILED: terminal={terminal_kind} "
                                    f"retrievable_seen={earliest_real is not None}"},
                    )

            await emit("summary", summary)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("early-cdn-webapi diagnostic errored")
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            await q.put(_DONE)

    # ── Client + call helpers ────────────────────────────────────────────

    async def _build_client(self, account_spec: str, PixverseClient: Any, log, emit) -> Any:
        """Build a PixverseClient from 'account:<id>' (DB session) or 'email:password'."""
        if account_spec.startswith("account:"):
            inner = account_spec.split(":", 1)[1].strip()
            if not inner.isdigit():
                await emit("error", {"message": f"account: spec requires numeric id, got '{inner}'"})
                return None
            account_id = int(inner)
            from pixsim7.backend.main.domain.providers import ProviderAccount
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                acc = await session.get(ProviderAccount, account_id)
            if acc is None:
                await emit("error", {"message": f"ProviderAccount {account_id} not found in pixsim DB."})
                return None
            if acc.provider_id != "pixverse":
                await emit("error", {"message": f"Account {account_id} is provider_id={acc.provider_id}, not pixverse."})
                return None
            if not acc.jwt_token:
                await emit(
                    "error",
                    {"message": f"Account {account_id} ({acc.email}) has no JWT — log in via the app first, "
                                "or pass email:password."},
                )
                return None
            await log(f"Using account:{account_id} ({acc.email}) from pixsim DB.")
            return PixverseClient(
                email=acc.email,
                session={
                    "jwt_token": acc.jwt_token,
                    "cookies": acc.cookies or {},
                    "use_method": "web-api",
                },
            )
        if ":" in account_spec:
            email, _, password = account_spec.partition(":")
            if not email or not password:
                await emit("error", {"message": "email:password spec needs both halves."})
                return None
            await log(f"Creating client for {email} (email+password login)…")
            return PixverseClient(email=email, password=password)
        await emit("error", {"message": f"Bad account spec '{account_spec}' — use account:<id> or email:password."})
        return None

    async def _try_get_video(self, client: Any, job_id: str, emit) -> Optional[Any]:
        try:
            return await client.get_video(video_id=job_id)
        except Exception as exc:  # noqa: BLE001
            await emit("log", {"level": "warning", "message": f"get_video error: {exc}"})
            return None

    async def _try_list_videos(self, client: Any, job_id: str, emit) -> Optional[dict]:
        try:
            videos = await client.list_videos(limit=50, offset=0)
        except Exception as exc:  # noqa: BLE001
            await emit("log", {"level": "warning", "message": f"list_videos error: {exc}"})
            return None
        for v in videos or []:
            raw_id = v.get("video_id") if isinstance(v, dict) else None
            if str(raw_id) == str(job_id):
                return v
        return None
