"""Early-CDN window diagnostic (OpenAPI variant).

Backend port of ``tests/manual_test_early_cdn_openapi.py`` — the OpenAPI
sibling of ``early_cdn_webapi``.  Asks whether Pixverse's OpenAPI i2v path
advertises a CDN URL pre-terminal, whether there's an early-CDN window,
and whether filtered jobs swap to a placeholder.

Differs from the WebAPI variant in three ways:

* **Auth** — OpenAPI key (via an ``AccountPool`` with ``use_method:
  open-api``), not a stored WebAPI JWT session.
* **Single source** — OpenAPI only polls ``get_video`` (no ``list_videos``),
  so the timeline tracks one stream of observations.
* **Image source resolution** — OpenAPI i2v needs an integer ``img_id``,
  so the ``source`` param supports several shapes:
    - ``video:<id>``   inspect-only: dump ``get_video`` and stop (no credit).
    - ``url:<url>`` / ``http(s)://…``  URL-field probe: POST the i2v
      endpoint trying ``img_url`` / ``image_url`` / ``customer_img_url`` in
      order, stop on first accepted field (verifies the undocumented
      URL-input path).
    - ``asset:<N>``    pixsim asset: reuse its cached ``provider_uploads
      ['pixverse']`` img_id, else upload its ``local_path``.
    - ``img_id:<N>``   reuse a prior OpenAPI upload directly.
    - ``path:<abs>``   upload a server-side local file fresh.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Optional

import asyncio

from .base import (
    Diagnostic,
    DiagnosticEvent,
    DiagnosticParam,
    DiagnosticSpec,
    parse_select_float,
)

logger = logging.getLogger(__name__)

_DONE = object()

_DEFAULT_PROMPT = "ACTIONS = SHE DANCES WILDLY, FIGURE 8 STRIPPER STYLE, BACK TO CAMERA"
_URL_FIELD_CANDIDATES = ("img_url", "image_url", "customer_img_url")
_PIXVERSE_BASE_URL = "https://app-api.pixverse.ai"

# OpenAPI status groupings (mirrors the manual test + SDK): 7/17 = filtered.
_COMPLETED_CODES = (1,)
_FILTERED_CODES = (7, 17)
_FAILED_CODES = (-1, 4, 8, 9)


@dataclass
class _Timeline:
    """Single-source transition tracker (OpenAPI polls get_video only)."""

    t_first_url: Optional[float] = None
    t_first_retrievable: Optional[float] = None
    t_placeholder: Optional[float] = None
    t_404: Optional[float] = None
    t_first_thumbnail: Optional[float] = None
    unique_urls: list[str] = field(default_factory=list)
    unique_thumbnails: list[str] = field(default_factory=list)
    last_url: Optional[str] = None

    _TRANSITION_FIELDS = (
        "t_first_url",
        "t_first_retrievable",
        "t_placeholder",
        "t_404",
        "t_first_thumbnail",
    )

    def record_obs(
        self,
        *,
        t_rel: float,
        url: Optional[str],
        url_is_retrievable: bool,
        url_is_placeholder: bool,
        thumbnail_url: Optional[str],
    ) -> None:
        if url:
            if url not in self.unique_urls:
                self.unique_urls.append(url)
            self.last_url = url
            if self.t_first_url is None:
                self.t_first_url = t_rel
        if url_is_retrievable and self.t_first_retrievable is None:
            self.t_first_retrievable = t_rel
        if url_is_placeholder and self.t_placeholder is None:
            self.t_placeholder = t_rel
        if thumbnail_url and thumbnail_url.startswith(("http://", "https://")):
            if thumbnail_url not in self.unique_thumbnails:
                self.unique_thumbnails.append(thumbnail_url)
            if self.t_first_thumbnail is None:
                self.t_first_thumbnail = t_rel

    def record_head(self, *, t_rel: float, http_status: Optional[int]) -> None:
        if http_status and http_status >= 400 and self.t_404 is None:
            self.t_404 = t_rel


def _extract_fields(v: Any) -> dict:
    if v is None:
        return {}
    if isinstance(v, dict):
        raw_status = v.get("video_status") or v.get("status")
        url = v.get("url") or v.get("video_url")
        thumb = v.get("first_frame") or v.get("thumbnail") or v.get("thumbnail_url")
        width = v.get("output_width") or v.get("width")
        height = v.get("output_height") or v.get("height")
    else:
        raw_status = getattr(v, "video_status", None) or getattr(v, "status", None)
        url = getattr(v, "url", None) or getattr(v, "video_url", None)
        thumb = getattr(v, "first_frame", None) or getattr(v, "thumbnail", None)
        width = getattr(v, "output_width", None) or getattr(v, "width", None)
        height = getattr(v, "output_height", None) or getattr(v, "height", None)
    return {"raw_status": raw_status, "url": url, "thumb": thumb, "width": width, "height": height}


class EarlyCdnOpenapiDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="early-cdn-openapi",
        label="Pixverse early-CDN window (OpenAPI)",
        description=(
            "OpenAPI sibling of early-cdn-webapi. Observe whether the OpenAPI "
            "i2v path advertises a CDN URL pre-terminal and times the "
            "real→placeholder swap + 200→404 lifespan (single-source: "
            "get_video only). Source resolution supports inspect-only, "
            "URL-field probe, pixsim asset, raw img_id, and fresh upload. "
            "Hits the live Pixverse API; submitting modes cost a credit."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="openapi_key",
                kind="string",
                label="Pixverse OpenAPI key",
                default="",
                required=True,
                description="From provider_accounts.api_keys (kind=openapi).",
            ),
            DiagnosticParam(
                name="source",
                kind="string",
                label="Image source",
                default="",
                required=True,
                description=(
                    "video:<id> (inspect-only) | url:<url> or http(s):// (URL-field probe) | "
                    "asset:<N> (pixsim asset) | img_id:<N> (reuse upload) | path:<abs> (upload file)."
                ),
            ),
            DiagnosticParam(
                name="prompt",
                kind="string",
                label="Prompt",
                default=_DEFAULT_PROMPT,
            ),
            DiagnosticParam(name="model", kind="string", label="Model", default="v6"),
            DiagnosticParam(name="duration", kind="int", label="Duration (s)", default=5),
            DiagnosticParam(name="quality", kind="string", label="Quality", default="360p"),
            DiagnosticParam(name="motion_mode", kind="string", label="Motion mode", default="normal"),
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
                description="After terminal, keep watching for a late thumbnail.",
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
            name="early-cdn-openapi-driver",
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
            openapi_key = str(params.get("openapi_key") or "").strip()
            source = str(params.get("source") or "").strip()
            prompt = str(params.get("prompt") or "").strip() or _DEFAULT_PROMPT
            model = str(params.get("model") or "v6").strip()
            duration = int(params.get("duration") or 5)
            quality = str(params.get("quality") or "360p").strip()
            motion_mode = str(params.get("motion_mode") or "normal").strip()
            poll_interval = max(0.1, parse_select_float(params.get("poll_interval_s"), 0.25))
            head_interval = max(0.1, parse_select_float(params.get("head_probe_interval_s"), 0.5))
            max_poll_minutes = max(0.5, parse_select_float(params.get("max_poll_minutes"), 6.0))
            post_terminal_s = max(0.0, parse_select_float(params.get("post_terminal_probe_s"), 60.0))

            if not openapi_key:
                await emit("error", {"message": "OpenAPI key is required."})
                return
            if not source:
                await emit("error", {"message": "Image source is required (see param help)."})
                return

            try:
                import httpx
                from pixverse import PixverseClient
                from pixverse.accounts import AccountPool
                from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
                    has_retrievable_pixverse_media_url,
                    is_pixverse_placeholder_url,
                    normalize_url,
                )
            except Exception as exc:  # noqa: BLE001
                await emit("error", {"message": f"Import failed: {exc}"})
                return

            def classify_url(url: Optional[str]) -> tuple[bool, bool]:
                if not url:
                    return False, False
                return is_pixverse_placeholder_url(url), has_retrievable_pixverse_media_url(url)

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

            # ── Inspect-only mode: dump get_video and stop ─────────────────
            if source.startswith("video:"):
                vid = source.split(":", 1)[1].strip()
                if not vid:
                    await emit("error", {"message": "video: spec missing an id"})
                    return
                await emit("phase", {"phase": "polling"})
                await log(f"Inspect mode — video_id={vid} (no submit)")
                try:
                    video = await client.get_video(video_id=vid)
                except Exception as exc:  # noqa: BLE001
                    await emit("error", {"message": f"get_video({vid}) failed: {exc}"})
                    return
                meta = getattr(video, "metadata", None) or {}
                await emit(
                    "observation",
                    {
                        "source": "inspect",
                        "video_id": vid,
                        **_extract_fields(video),
                        "metadata_keys": sorted(meta.keys()) if isinstance(meta, dict) else None,
                    },
                )
                await emit("phase", {"phase": "done"})
                await emit(
                    "summary",
                    {"mode": "inspect", "video_id": vid, **_extract_fields(video)},
                )
                return

            # ── Resolve image source → img_id (or URL-probe submission) ─────
            await emit("phase", {"phase": "submitting"})
            job_id: Optional[str] = None
            initial_fields: dict = {}
            probe_field: Optional[str] = None

            if source.startswith(("url:", "http://", "https://")):
                image_url = source[4:].strip() if source.startswith("url:") else source
                await log(f"URL-probe mode — trying i2v URL fields for {image_url[:80]}")
                probe = await self._probe_url_fields(
                    httpx, openapi_key, image_url, prompt, model, duration, quality, motion_mode, emit,
                )
                if probe is None:
                    return  # error already emitted
                job_id = probe["video_id"]
                probe_field = probe["field_name"]
                initial_fields = _extract_fields(probe["raw_response"].get("Resp", {}))
                await log(f"URL field '{probe_field}' accepted — job_id={job_id}")
            else:
                img_id = await self._resolve_img_id(source, client, sdk_account, emit, log)
                if img_id is None:
                    return  # error already emitted
                await log(f"Submitting i2v job (OpenAPI, img_id={img_id})…")
                try:
                    video = await client.create(
                        prompt=prompt,
                        image_url=f"img_id:{img_id}",
                        model=model,
                        duration=duration,
                        quality=quality,
                        motion_mode=motion_mode,
                    )
                except Exception as exc:  # noqa: BLE001
                    await emit("error", {"message": f"submit failed: {type(exc).__name__}: {exc}"})
                    return
                job_id = str(getattr(video, "id", "") or "")
                if not job_id:
                    await emit("error", {"message": "submit response missing job id"})
                    return
                initial_fields = _extract_fields(video)

            t0_holder["t0"] = loop.time()  # reset clock to submit-accepted
            await log(
                f"Submitted — job_id={job_id} initial_status={initial_fields.get('raw_status')} "
                f"initial_url={initial_fields.get('url')}"
            )
            await emit("transition", {"key": "t_submit", "value": 0.0, "job_id": job_id})

            timeline = _Timeline()
            stop_event = asyncio.Event()
            seen_statuses: list[str] = []

            # Record the submit response as an observation at t≈0.
            is_ph0, is_ret0 = classify_url(initial_fields.get("url"))
            timeline.record_obs(
                t_rel=0.0,
                url=initial_fields.get("url"),
                url_is_retrievable=is_ret0,
                url_is_placeholder=is_ph0,
                thumbnail_url=initial_fields.get("thumb"),
            )
            await emit(
                "observation",
                {
                    "source": "submit",
                    "raw_status": initial_fields.get("raw_status"),
                    "url": initial_fields.get("url"),
                    "url_is_retrievable": is_ret0,
                    "url_is_placeholder": is_ph0,
                    "url_field": probe_field,
                    "width": initial_fields.get("width"),
                    "height": initial_fields.get("height"),
                },
            )
            await emit_new_transitions(timeline)

            # ── Phase: polling ─────────────────────────────────────────────
            await emit("phase", {"phase": "polling"})

            async with httpx.AsyncClient(
                timeout=5.0,
                follow_redirects=True,
                headers={"User-Agent": "PixSim7-EarlyCDN-OpenAPI-Probe/1.0"},
            ) as http_client:

                async def head_probe_monitor() -> None:
                    last_probed: Optional[str] = None
                    while not stop_event.is_set() and not cancel_event.is_set():
                        try:
                            await asyncio.wait_for(stop_event.wait(), timeout=head_interval)
                        except asyncio.TimeoutError:
                            pass
                        url = timeline.last_url
                        if not url:
                            continue
                        # Pixverse URLs may carry %2F-encoded slashes that 404
                        # verbatim — normalize before probing.
                        target = normalize_url(url) or url
                        try:
                            r = await http_client.head(target)
                            status = r.status_code
                        except Exception as exc:  # noqa: BLE001
                            await emit(
                                "observation",
                                {"source": "head_probe", "http_status": None,
                                 "url": url, "error": str(exc)[:120]},
                            )
                            continue
                        note = "same_url" if url == last_probed else "new_url"
                        last_probed = url
                        timeline.record_head(t_rel=now(), http_status=status)
                        await emit(
                            "observation",
                            {"source": "head_probe", "http_status": status, "url": url, "note": note},
                        )
                        await emit_new_transitions(timeline)

                probe_task = asyncio.create_task(head_probe_monitor(), name="early-cdn-openapi-head-probe")

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
                        try:
                            v = await client.get_video(video_id=job_id)
                        except Exception as exc:  # noqa: BLE001
                            await log(f"get_video error: {exc}", level="warning")
                            continue

                        fields = _extract_fields(v)
                        status_str = str(fields["raw_status"])
                        if status_str not in seen_statuses:
                            seen_statuses.append(status_str)
                        is_ph, is_ret = classify_url(fields["url"])
                        timeline.record_obs(
                            t_rel=t_rel,
                            url=fields["url"],
                            url_is_retrievable=is_ret,
                            url_is_placeholder=is_ph,
                            thumbnail_url=fields.get("thumb"),
                        )
                        await emit(
                            "observation",
                            {
                                "source": "get_video",
                                "raw_status": fields["raw_status"],
                                "url": fields["url"],
                                "url_is_retrievable": is_ret,
                                "url_is_placeholder": is_ph,
                                "thumb_present": bool(fields.get("thumb")),
                                "width": fields["width"],
                                "height": fields["height"],
                            },
                        )
                        await emit_new_transitions(timeline)

                        raw_status = fields.get("raw_status")
                        if isinstance(raw_status, int):
                            if raw_status in _COMPLETED_CODES or (
                                raw_status == 10 and fields.get("width") and fields.get("height")
                            ):
                                terminal, terminal_kind = True, "completed"
                            elif raw_status in _FILTERED_CODES:
                                terminal, terminal_kind = True, "filtered"
                            elif raw_status in _FAILED_CODES:
                                terminal, terminal_kind = True, "failed"
                            if terminal:
                                await log(f"=== {terminal_kind.upper()} (raw={raw_status}) ===")
                                await emit("transition", {"key": "t_terminal", "value": t_rel,
                                                          "kind": terminal_kind})
                                break

                    # ── Phase: post_terminal ────────────────────────────────
                    if timeline.last_url and not cancel_event.is_set():
                        await emit("phase", {"phase": "post_terminal"})
                        await log(f"Post-terminal monitoring up to {post_terminal_s:.0f}s — watching for late thumbnail…")
                        post_deadline = loop.time() + post_terminal_s
                        while loop.time() < post_deadline and not cancel_event.is_set():
                            await asyncio.sleep(2.0)
                            t_rel = now()
                            try:
                                v = await client.get_video(video_id=job_id)
                            except Exception:  # noqa: BLE001
                                continue
                            f = _extract_fields(v)
                            is_ph, is_ret = classify_url(f.get("url"))
                            timeline.record_obs(
                                t_rel=t_rel,
                                url=f.get("url"),
                                url_is_retrievable=is_ret,
                                url_is_placeholder=is_ph,
                                thumbnail_url=f.get("thumb"),
                            )
                            await emit_new_transitions(timeline)
                            if f.get("thumb"):
                                await log(f"POST-TERMINAL thumbnail appeared: {f.get('thumb')}")
                                break
                finally:
                    stop_event.set()
                    await asyncio.gather(probe_task, return_exceptions=True)

            # ── Phase: done + summary ──────────────────────────────────────
            await emit("phase", {"phase": "done"})
            window = (
                timeline.t_placeholder - timeline.t_first_retrievable
                if timeline.t_first_retrievable is not None and timeline.t_placeholder is not None
                else None
            )
            cdn_lifespan = (
                timeline.t_404 - timeline.t_first_retrievable
                if timeline.t_first_retrievable is not None and timeline.t_404 is not None
                else None
            )
            thumb_vs_url_lag = (
                timeline.t_first_thumbnail - timeline.t_first_retrievable
                if timeline.t_first_thumbnail is not None and timeline.t_first_retrievable is not None
                else None
            )
            await emit(
                "summary",
                {
                    "mode": "openapi",
                    "url_field": probe_field,
                    "job_id": job_id,
                    "model": model,
                    "quality": quality,
                    "duration": duration,
                    "terminal_kind": terminal_kind,
                    "get_video_statuses": seen_statuses,
                    "t_first_url": timeline.t_first_url,
                    "t_first_retrievable": timeline.t_first_retrievable,
                    "t_placeholder": timeline.t_placeholder,
                    "t_404": timeline.t_404,
                    "t_first_thumbnail": timeline.t_first_thumbnail,
                    "advertised_window_s": window,
                    "cdn_lifespan_s": cdn_lifespan,
                    "thumb_vs_url_lag_s": thumb_vs_url_lag,
                    "unique_urls": list(timeline.unique_urls),
                    "unique_thumbnails": list(timeline.unique_thumbnails),
                },
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("early-cdn-openapi diagnostic errored")
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            await q.put(_DONE)

    # ── Source resolution ────────────────────────────────────────────────

    async def _resolve_img_id(self, source: str, client: Any, sdk_account: Any, emit, log) -> Optional[str]:
        """Resolve a non-URL source to an OpenAPI img_id (uploading if needed)."""
        if source.startswith("img_id:"):
            inner = source.split(":", 1)[1].strip()
            if not inner.isdigit():
                await emit("error", {"message": f"img_id: requires a numeric id, got '{inner}'"})
                return None
            await log(f"Reusing img_id={inner} (no upload).")
            return inner

        if source.startswith("asset:"):
            inner = source.split(":", 1)[1].strip()
            if not inner.isdigit():
                await emit("error", {"message": f"asset: requires a numeric id, got '{inner}'"})
                return None
            cached_id, local_path = await self._resolve_app_asset(int(inner))
            if cached_id:
                await log(f"Asset {inner} has cached img_id={cached_id}")
                return cached_id
            if local_path and Path(local_path).exists():
                await log(f"Asset {inner} has no cached img_id — uploading {local_path}")
                return await self._upload(client, sdk_account, local_path, emit)
            await emit(
                "error",
                {"message": f"Asset {inner} not found, or has neither a cached img_id nor a local file."},
            )
            return None

        if source.startswith("path:"):
            path = source.split(":", 1)[1].strip()
            if not path or not Path(path).exists():
                await emit("error", {"message": f"Image file not found: {path}"})
                return None
            await log(f"Uploading source image via OpenAPI: {path}")
            return await self._upload(client, sdk_account, path, emit)

        await emit(
            "error",
            {"message": f"Unrecognized source '{source}'. Use video:/url:/asset:/img_id:/path: prefixes."},
        )
        return None

    async def _upload(self, client: Any, sdk_account: Any, file_path: str, emit) -> Optional[str]:
        try:
            result = await client.api.upload_media(file_path=file_path, account=sdk_account)
        except Exception as exc:  # noqa: BLE001
            await emit("error", {"message": f"upload failed: {type(exc).__name__}: {exc}"})
            return None
        img_id = result.get("id") if isinstance(result, dict) else None
        if not img_id:
            await emit("error", {"message": f"Upload returned no id. Response: {result}"})
            return None
        return str(img_id)

    async def _resolve_app_asset(self, asset_id: int) -> tuple[Optional[str], Optional[str]]:
        """Return (cached_img_id, local_path) for a pixsim asset, or (None, None)."""
        from sqlalchemy import select

        from pixsim7.backend.main.domain import Asset
        from pixsim7.backend.main.infrastructure.database.session import get_async_session

        async with get_async_session() as session:
            row = (
                await session.execute(select(Asset).where(Asset.id == asset_id))
            ).scalar_one_or_none()
        if not row:
            return None, None
        entry = (row.provider_uploads or {}).get("pixverse")
        cached_id: Optional[str] = None
        if isinstance(entry, dict):
            raw = entry.get("id")
            if raw is not None and str(raw).isdigit():
                cached_id = str(raw)
        elif isinstance(entry, str) and entry.isdigit():
            cached_id = entry
        return cached_id, row.local_path

    async def _probe_url_fields(
        self,
        httpx: Any,
        openapi_key: str,
        image_url: str,
        prompt: str,
        model: str,
        duration: int,
        quality: str,
        motion_mode: str,
        emit,
    ) -> Optional[dict]:
        """Try each i2v URL-field candidate; return the first accepted submission."""
        endpoint = f"{_PIXVERSE_BASE_URL}/openapi/v2/video/img/generate"
        base_payload = {
            "prompt": prompt,
            "model": model,
            "duration": duration,
            "quality": quality,
            "motion_mode": motion_mode,
        }
        last_errors: list[dict] = []
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            for field_name in _URL_FIELD_CANDIDATES:
                payload = {**base_payload, field_name: image_url}
                headers = {
                    "API-KEY": openapi_key,
                    "Ai-trace-id": str(uuid.uuid4()),
                    "Content-Type": "application/json",
                }
                try:
                    resp = await http_client.post(endpoint, json=payload, headers=headers)
                    body = resp.json()
                except Exception as exc:  # noqa: BLE001
                    await emit("observation", {"source": "url_probe", "field": field_name,
                                               "error": str(exc)[:120]})
                    last_errors.append({"field": field_name, "error": str(exc)})
                    continue

                err_code = body.get("ErrCode")
                err_msg = body.get("ErrMsg")
                resp_obj = body.get("Resp") or {}
                video_id = resp_obj.get("video_id") or resp_obj.get("id")
                await emit(
                    "observation",
                    {
                        "source": "url_probe",
                        "field": field_name,
                        "http_status": resp.status_code,
                        "err_code": err_code,
                        "err_msg": err_msg,
                        "video_id": video_id,
                        "accepted": bool(resp.status_code == 200 and err_code == 0 and video_id),
                    },
                )
                if resp.status_code == 200 and err_code == 0 and video_id:
                    return {"video_id": str(video_id), "field_name": field_name, "raw_response": body}
                last_errors.append({"field": field_name, "err_code": err_code, "err_msg": err_msg})

        await emit(
            "error",
            {
                "message": "No URL field accepted by the OpenAPI i2v endpoint — "
                           "URL input may be unsupported. Use img_id:/asset:/path: instead.",
                "attempts": last_errors,
            },
        )
        return None
