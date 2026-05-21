"""Pixverse image CDN-salvage diagnostic (LIVE).

Backend port of ``tests/manual_test_pixverse_image_salvage_live_manual.py`` —
the IMAGE analogue of the early-CDN video diagnostics.  Drives the real
production salvage (``_try_pixverse_image_cdn_salvage``) against live
Pixverse submissions to confirm our logic still matches Pixverse's real
behaviour.

Phase A (happy-path assertion): submit a benign i2i prompt, poll
``get_image`` to terminal, assert COMPLETED with a CDN URL that actually
serves (HEAD 200).  Confirms account/session/credits + the live image
pipeline.

Phase B (observational moderation/salvage): submit ``violation_samples``
filter-bait jobs concurrently (suggestive source + suggestive prompt that
renders-then-post-filters), record the raw ``image_status``, HEAD-probe the
pre-allocated CDN object, then drive the real salvage and check the
*consistent* outcome:

  - object 200s  → false filter → salvage must recover (COMPLETED +
    image_false_filter_recovered + early-CDN terminal; filtered originals
    are also is_early_cdn_filtered).
  - object 404s / placeholder → genuine → stays filtered/failed (fail-safe).

Plus five purely-observational sub-probes per sample (thumbnail, URL drift
across polls, a 30s time-series re-probe, the list endpoint, and a
GET-after-HEAD fallback that flags HEAD/GET disagreement).

Aggregate: FAIL if any sample is inconsistent; PASS if ≥1 sample tripped a
filter and every tripped sample was consistent; else SKIP/INCONCLUSIVE
(provider variance — not a failure).  A robust A with a skipped B passes.

Hits the live Pixverse API and makes billed calls — admin-gated.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, AsyncIterator, Optional
from urllib.parse import unquote

from .base import Diagnostic, DiagnosticEvent, DiagnosticParam, DiagnosticSpec

logger = logging.getLogger(__name__)

_DONE = object()

_DEFAULT_BENIGN_PROMPT = "Make it a soft watercolor painting, calm and serene"
_DEFAULT_VIOLATION_PROMPT = "change background, preserve woman"
_DEFAULT_SOURCE_IMAGE_URL = (
    "https://media.pixverse.ai/pixverse/i2i/ori/"
    "6eac1a42-f0b3-4649-a3db-a13f3ef66b8f.png"
)
_DEFAULT_VIOLATION_ASSET_ID = 46360
_VIOLATION_FALLBACK_URL = (
    "https://media.pixverse.ai/openapi/"
    "22b41e80-1002-4905-8817-afeb66bbdcc2_cca85883542dc195891af14f093f74ba_auto.jpg"
)
_DEFAULT_MODEL = "seedream-4.0"


def _usable_pixverse_url(value: Any) -> Optional[str]:
    """Return a create_image-usable Pixverse URL, or None.

    create_image rejects URL-encoded ``%2F`` forms (ErrCode 400017); the
    clean decoded ``https://media.pixverse.ai/...`` shape works.
    """
    if not isinstance(value, str) or not value.startswith("http"):
        return None
    if "pixverse.ai" not in value:
        return None
    return unquote(value) if "%2F" in value else value


def _leading_int(value: Any, default: int) -> int:
    """Extract the leading integer from a select-option string like '8 — many …'.

    Tolerates a bare int (programmatic callers) or any non-numeric value
    (falls back to ``default``).
    """
    try:
        return max(1, int(str(value).strip().split()[0]))
    except (ValueError, IndexError, TypeError):
        return default


def _build_synthetic_submission(job_id: str, url: Optional[str]) -> SimpleNamespace:
    """Minimal ProviderSubmission stand-in the salvage reads (job id + response)."""
    return SimpleNamespace(
        provider_job_id=job_id,
        response={"image_url": url} if url else {},
    )


class PixverseImageSalvageDiagnostic(Diagnostic):
    spec = DiagnosticSpec(
        id="pixverse-image-salvage",
        label="Pixverse image CDN-salvage (live)",
        description=(
            "Drive the production image CDN-salvage against live Pixverse "
            "submissions. Phase A asserts a benign i2i happy path (COMPLETED "
            "+ HEAD 200). Phase B submits filter-bait jobs concurrently, "
            "HEAD-probes the pre-allocated CDN object, runs the real salvage, "
            "and checks the false-filter-recovers / genuine-stays-terminal "
            "contract + 5 observational sub-probes. Makes billed Pixverse calls."
        ),
        category="diagnostic",
        params=(
            DiagnosticParam(
                name="account",
                kind="string",
                label="Account",
                default="",
                required=True,
                description="'account:<id>' (stored JWT+OpenAPI key from pixsim DB) or 'email:password'.",
            ),
            DiagnosticParam(
                name="phase",
                kind="select",
                label="Phases",
                default="both",
                options=["both", "benign-only", "violation-only"],
                description="Run A only, B only, or both.",
            ),
            DiagnosticParam(
                name="violation_samples",
                kind="select",
                label="Concurrent bait jobs (Phase B)",
                default="1 — single (free-tier safe)",
                options=[
                    "1 — single (free-tier safe)",
                    "3 — a few samples",
                    "5 — several",
                    "8 — many (needs high-concurrency account)",
                ],
                description=(
                    "How many filter-bait images to submit at once. Each is an "
                    "independent moderation sample — more = more chances to catch a "
                    "real filter outcome in one run, but they fire concurrently, so "
                    "the account's plan must allow that many simultaneous generations."
                ),
            ),
            DiagnosticParam(name="model", kind="string", label="Model", default=_DEFAULT_MODEL),
            DiagnosticParam(
                name="quality",
                kind="string",
                label="Quality",
                default="",
                description="Blank derives the model's cheapest quality (else 1080p).",
            ),
            DiagnosticParam(
                name="benign_prompt", kind="string", label="Benign prompt", default=_DEFAULT_BENIGN_PROMPT,
            ),
            DiagnosticParam(
                name="violation_prompt", kind="string", label="Violation prompt", default=_DEFAULT_VIOLATION_PROMPT,
            ),
            DiagnosticParam(
                name="source",
                kind="string",
                label="Benign source URL",
                default=_DEFAULT_SOURCE_IMAGE_URL,
                description="Must be a media.pixverse.ai-hosted image.",
            ),
            DiagnosticParam(
                name="violation_source",
                kind="string",
                label="Bait source URL override",
                default="",
                description="Blank resolves the bait asset instead.",
            ),
            DiagnosticParam(
                name="violation_asset",
                kind="int",
                label="Bait asset id",
                default=_DEFAULT_VIOLATION_ASSET_ID,
                description="pixsim asset whose local file is uploaded fresh as the bait (default 46360).",
            ),
            DiagnosticParam(name="poll_interval_s", kind="float", label="Poll interval (s)", default=2.0),
            DiagnosticParam(name="max_poll_minutes", kind="float", label="Max poll (min)", default=6.0),
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
            name="pixverse-image-salvage-driver",
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
            account_spec = str(params.get("account") or "").strip()
            phase = str(params.get("phase") or "both").strip().lower()
            samples = _leading_int(params.get("violation_samples"), 1)
            model = str(params.get("model") or _DEFAULT_MODEL).strip()
            benign_prompt = str(params.get("benign_prompt") or "").strip() or _DEFAULT_BENIGN_PROMPT
            violation_prompt = str(params.get("violation_prompt") or "").strip() or _DEFAULT_VIOLATION_PROMPT
            source = str(params.get("source") or "").strip() or _DEFAULT_SOURCE_IMAGE_URL
            violation_source = str(params.get("violation_source") or "").strip()
            try:
                violation_asset = int(params.get("violation_asset") or _DEFAULT_VIOLATION_ASSET_ID)
            except (TypeError, ValueError):
                violation_asset = _DEFAULT_VIOLATION_ASSET_ID
            poll_interval = max(0.5, float(params.get("poll_interval_s") or 2.0))
            max_poll_minutes = max(0.5, float(params.get("max_poll_minutes") or 6.0))

            if not account_spec:
                await emit("error", {"message": "Account is required (account:<id> or email:password)."})
                return
            if phase not in ("both", "benign-only", "violation-only"):
                await emit("error", {"message": f"Unknown phase '{phase}'."})
                return

            try:
                from pixverse import ImageModel
                from pixsim7.backend.main.domain.enums import ProviderStatus
                from pixsim7.backend.main.services.provider.base import ProviderStatusResult
                from pixsim7.backend.main.services.provider.cdn_probe import cdn_head_probe
                from pixsim7.backend.main.services.provider.early_cdn import (
                    is_early_cdn_filtered,
                    is_early_cdn_terminal,
                )
                from pixsim7.backend.main.services.provider.adapters.pixverse_status import (
                    _map_pixverse_status_for,
                    _scan_image_list,
                )
                from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
                    is_pixverse_placeholder_url,
                )
                from pixsim7.backend.main.services.provider.provider_service import (
                    _try_pixverse_image_cdn_salvage,
                )
            except Exception as exc:  # noqa: BLE001
                await emit("error", {"message": f"Import failed: {exc}"})
                return

            spec = ImageModel.get(model)
            quality = (
                str(params.get("quality") or "").strip()
                or (spec.qualities[0] if spec and spec.qualities else None)
                or "1080p"
            )

            # Bundle the resolved helpers/config the phase methods need.
            ctx = SimpleNamespace(
                emit=emit,
                log=log,
                now=now,
                cancel_event=cancel_event,
                model=model,
                quality=quality,
                poll_interval=poll_interval,
                max_poll_minutes=max_poll_minutes,
                ProviderStatus=ProviderStatus,
                ProviderStatusResult=ProviderStatusResult,
                cdn_head_probe=cdn_head_probe,
                is_early_cdn_filtered=is_early_cdn_filtered,
                is_early_cdn_terminal=is_early_cdn_terminal,
                map_status=_map_pixverse_status_for,
                scan_image_list=_scan_image_list,
                is_placeholder=is_pixverse_placeholder_url,
                salvage=_try_pixverse_image_cdn_salvage,
            )

            # ── Phase: init / build client ─────────────────────────────────
            await emit("phase", {"phase": "init"})
            client = await self._build_client(account_spec, ctx)
            if client is None:
                return
            if cancel_event.is_set():
                return

            phase_a_ok: Optional[bool] = None
            phase_b: Optional[bool] = None

            if phase != "violation-only":
                await emit("phase", {"phase": "benign"})
                phase_a_ok = await self._run_phase_a(client, ctx, benign_prompt, source)

            if phase != "benign-only" and not cancel_event.is_set():
                await emit("phase", {"phase": "violation"})
                phase_b = await self._run_phase_b(
                    client, ctx, samples, violation_prompt, violation_source, violation_asset,
                )

            # ── Phase: done + summary ──────────────────────────────────────
            await emit("phase", {"phase": "done"})
            hard_fail = phase_a_ok is False or phase_b is False
            await emit(
                "summary",
                {
                    "phase_a": ("pass" if phase_a_ok else "fail") if phase_a_ok is not None else "skipped",
                    "phase_b": (
                        "pass" if phase_b is True
                        else "fail" if phase_b is False
                        else "skipped/inconclusive"
                    ),
                    "model": model,
                    "quality": quality,
                    "violation_samples": samples,
                    "hard_fail": hard_fail,
                },
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("pixverse-image-salvage diagnostic errored")
            await emit("error", {"message": f"{type(exc).__name__}: {exc}"})
        finally:
            await q.put(_DONE)

    # ── Client ────────────────────────────────────────────────────────────

    async def _build_client(self, account_spec: str, ctx) -> Any:
        """account:<id> (stored JWT + wired OpenAPI key for uploads) or email:password."""
        from pixverse import PixverseClient

        if account_spec.startswith("account:"):
            inner = account_spec.split(":", 1)[1].strip()
            if not inner.isdigit():
                await ctx.emit("error", {"message": f"account: requires a numeric id, got '{inner}'"})
                return None
            account_id = int(inner)
            from pixsim7.backend.main.domain.providers import ProviderAccount
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                acc = await session.get(ProviderAccount, account_id)
            if acc is None:
                await ctx.emit("error", {"message": f"ProviderAccount {account_id} not found in pixsim DB."})
                return None
            if acc.provider_id != "pixverse":
                await ctx.emit("error", {"message": f"Account {account_id} is provider_id={acc.provider_id}, not pixverse."})
                return None
            if not acc.jwt_token:
                await ctx.emit("error", {"message": f"Account {account_id} ({acc.email}) has no JWT — log in via the app first."})
                return None
            openapi_key = None
            for k in acc.api_keys or []:
                if isinstance(k, dict) and k.get("kind") == "openapi":
                    openapi_key = k.get("value")
                    break
            await ctx.log(f"Using account:{account_id} ({acc.email}); openapi_key={'yes' if openapi_key else 'no'}")
            sess: dict = {"jwt_token": acc.jwt_token, "cookies": acc.cookies or {}, "use_method": "web-api"}
            if openapi_key:
                sess["openapi_key"] = openapi_key
            return PixverseClient(email=acc.email, session=sess)
        if ":" in account_spec:
            email, _, password = account_spec.partition(":")
            if not email or not password:
                await ctx.emit("error", {"message": "email:password spec needs both halves."})
                return None
            await ctx.log(f"Creating client for {email} (email+password login)…")
            return PixverseClient(email=email, password=password)
        await ctx.emit("error", {"message": f"Bad account spec '{account_spec}' — use account:<id> or email:password."})
        return None

    # ── Submit + poll ─────────────────────────────────────────────────────

    @staticmethod
    def _extract_image_fields(payload: Any) -> dict:
        """get_image → {raw_status, url, thumb, ...}, mirroring the SDK key precedence."""
        if payload is None:
            return {}
        if isinstance(payload, dict):
            raw_status = payload.get("image_status") if payload.get("image_status") is not None else payload.get("status")
            url = payload.get("image_url") or payload.get("url") or payload.get("asset_url")
            thumb = payload.get("first_frame") or payload.get("thumbnail") or payload.get("thumbnail_url")
            width = payload.get("output_width") or payload.get("width")
            height = payload.get("output_height") or payload.get("height")
        else:
            raw_status = getattr(payload, "image_status", None)
            if raw_status is None:
                raw_status = getattr(payload, "status", None)
            url = (
                getattr(payload, "image_url", None)
                or getattr(payload, "url", None)
                or getattr(payload, "asset_url", None)
            )
            thumb = getattr(payload, "first_frame", None) or getattr(payload, "thumbnail", None)
            width = getattr(payload, "output_width", None) or getattr(payload, "width", None)
            height = getattr(payload, "output_height", None) or getattr(payload, "height", None)
        return {"raw_status": raw_status, "url": url, "thumb": thumb, "width": width, "height": height}

    async def _submit_and_poll(self, client: Any, ctx, prompt: str, source_url: str, label: str) -> dict:
        """Submit an i2i job and poll get_image to terminal. Returns the last poll dict."""
        await ctx.log(
            f"[{label}] Submitting i2i model={ctx.model} quality={ctx.quality} "
            f"src={source_url[:70]} prompt={prompt[:60]!r}"
        )
        created = await client.create_image(
            prompt=prompt, image_urls=source_url, model=ctx.model, quality=ctx.quality,
        )
        job_id = str(created.get("id") if isinstance(created, dict) else getattr(created, "id", None))
        if not job_id or job_id == "None":
            raise RuntimeError(f"[{label}] create_image returned no id: {created!r}")
        await ctx.log(f"[{label}] Submitted — job_id={job_id}")

        deadline = time.monotonic() + ctx.max_poll_minutes * 60
        last: dict = {}
        seen: list[str] = []
        pre_url: Optional[str] = None
        urls_seen: list[str] = []
        thumbs_seen: list[str] = []
        terminal_states = (
            ctx.ProviderStatus.COMPLETED, ctx.ProviderStatus.FILTERED,
            ctx.ProviderStatus.FAILED, ctx.ProviderStatus.CANCELLED,
        )
        while time.monotonic() < deadline:
            if ctx.cancel_event.is_set():
                await ctx.log(f"[{label}] cancelled mid-poll", level="warning")
                return last
            await asyncio.sleep(ctx.poll_interval)
            try:
                payload = await client.get_image(image_id=job_id)
            except Exception as e:  # noqa: BLE001 — transient, keep polling
                await ctx.log(f"[{label}] get_image error: {e}", level="warning")
                continue
            fields = self._extract_image_fields(payload)
            mapped = ctx.map_status(payload, is_image=True)
            url = fields["url"]
            thumb = fields.get("thumb")
            if url and str(url).startswith("http"):
                if url not in urls_seen:
                    urls_seen.append(url)
                if not ctx.is_placeholder(url):
                    pre_url = url  # mirrors submission.response URL retention
            if thumb and isinstance(thumb, str) and thumb.startswith("http") and thumb not in thumbs_seen:
                thumbs_seen.append(thumb)
            last = {
                "job_id": job_id,
                "raw_status": fields["raw_status"],
                "mapped_status": mapped,
                "url": url,
                "pre_url": pre_url,
                "thumb": thumb,
                "urls_seen": urls_seen,
                "thumbs_seen": thumbs_seen,
                "raw_payload": payload,
            }
            tag = str(fields["raw_status"])
            if tag not in seen:
                seen.append(tag)
            await ctx.emit(
                "observation",
                {
                    "source": "get_image",
                    "label": label,
                    "raw_status": fields["raw_status"],
                    "mapped_status": getattr(mapped, "value", str(mapped)),
                    "url_present": bool(url),
                    "pre_url_retained": bool(not url and pre_url),
                },
            )
            if mapped in terminal_states:
                await ctx.log(f"[{label}] === TERMINAL: {mapped.value} (raw path {' → '.join(seen)}) ===")
                await ctx.emit("transition", {"key": f"t_terminal_{label}", "value": ctx.now(),
                                              "mapped": mapped.value})
                return last
        await ctx.log(f"[{label}] poll timed out after {ctx.max_poll_minutes}m", level="warning")
        return last

    # ── Phase A ───────────────────────────────────────────────────────────

    async def _run_phase_a(self, client: Any, ctx, benign_prompt: str, source: str) -> bool:
        await ctx.log("PHASE A — benign i2i happy path (the main value)")
        try:
            result = await self._submit_and_poll(client, ctx, benign_prompt, source, "A")
        except Exception as e:  # noqa: BLE001
            await ctx.emit("error", {"message": f"[A] submit/poll raised: {e}"})
            return False
        mapped = result.get("mapped_status")
        url = result.get("url")

        if mapped != ctx.ProviderStatus.COMPLETED:
            await ctx.log(
                f"[A] FAIL — expected COMPLETED, got {getattr(mapped, 'value', mapped)} "
                f"(raw={result.get('raw_status')}).", level="warning",
            )
            return False
        if not url or not str(url).startswith("http"):
            await ctx.log(f"[A] FAIL — COMPLETED but no usable image URL: {url!r}", level="warning")
            return False
        if ctx.is_placeholder(url):
            await ctx.log(f"[A] FAIL — COMPLETED but URL is a placeholder: {url}", level="warning")
            return False

        serves = await ctx.cdn_head_probe(url)
        await ctx.emit("observation", {"source": "cdn_head", "label": "A", "serves": serves, "url": url})
        if serves is not True:
            await ctx.log(f"[A] FAIL — completed image URL did not serve (probe={serves!r}).", level="warning")
            return False
        await ctx.log("[A] PASS — COMPLETED, CDN URL serves (HEAD 200).")
        return True

    # ── Phase B ───────────────────────────────────────────────────────────

    async def _run_phase_b(
        self,
        client: Any,
        ctx,
        samples: int,
        violation_prompt: str,
        violation_source: str,
        violation_asset: int,
    ) -> Optional[bool]:
        await ctx.log(f"PHASE B — {samples} filter-bait i2i job(s), concurrent + live salvage (best-effort)")
        source = await self._resolve_violation_source(client, ctx, violation_source, violation_asset)

        async def _one(idx: int) -> Optional[dict]:
            tag = f"B{idx}" if samples > 1 else "B"
            try:
                return await self._submit_and_poll(client, ctx, violation_prompt, source, tag)
            except Exception as e:  # noqa: BLE001
                await ctx.log(f"[{tag}] SKIP — submit/poll raised: {e}", level="warning")
                return None

        results = await asyncio.gather(*[_one(i + 1) for i in range(samples)])

        rows: list[dict] = []
        verdicts: list[Optional[bool]] = []
        for i, result in enumerate(results, start=1):
            tag = f"B{i}" if samples > 1 else "B"
            if result is None:
                rows.append({"tag": tag, "raw": "-", "mapped": "-", "candidate": False,
                             "head": "-", "verdict": "SKIP", "note": "submit/poll raised"})
                verdicts.append(None)
                continue
            verdicts.append(await self._analyze_b_sample(tag, ctx, result, rows))
            if ctx.cancel_event.is_set():
                break
            try:
                await self._observe_extra_recovery_paths(tag, client, ctx, result)
            except Exception as e:  # noqa: BLE001
                await ctx.log(f"[{tag}] observational extras raised: {e}", level="warning")

        await ctx.emit("observation", {"source": "phase_b_table", "rows": rows})
        if any(v is False for v in verdicts):
            return False
        if any(v is True for v in verdicts):
            return True
        return None

    async def _resolve_violation_source(self, client: Any, ctx, override: str, asset_id: int) -> str:
        if override:
            await ctx.log("[B] bait source = violation_source override")
            return override
        try:
            from sqlalchemy import select

            from pixsim7.backend.main.domain import Asset
            from pixsim7.backend.main.infrastructure.database.session import get_async_session

            async with get_async_session() as session:
                asset = (
                    await session.execute(select(Asset).where(Asset.id == asset_id))
                ).scalar_one_or_none()
            if asset is None:
                await ctx.log(f"[B] asset {asset_id} not found — legacy bait URL.", level="warning")
                return _VIOLATION_FALLBACK_URL
            entry = (asset.provider_uploads or {}).get("pixverse")
            cached = entry.get("url") if isinstance(entry, dict) else entry
            usable = _usable_pixverse_url(cached)
            if usable:
                await ctx.log(f"[B] bait source = asset {asset_id} cached provider_uploads URL")
                return usable
            local_path = asset.local_path
            if not local_path or not Path(local_path).exists():
                await ctx.log(f"[B] asset {asset_id} has no cached URL and no local file — legacy bait URL.", level="warning")
                return _VIOLATION_FALLBACK_URL
            await ctx.log(f"[B] no cached URL — uploading asset {asset_id} local file fresh: {local_path}")
            up = await client.upload_media(local_path)
            ref = _usable_pixverse_url(up.get("url") if isinstance(up, dict) else up)
            if not ref:
                await ctx.log(f"[B] upload returned no usable URL ({up!r}) — legacy bait URL.", level="warning")
                return _VIOLATION_FALLBACK_URL
            await ctx.log(f"[B] bait source = fresh upload  ref={ref[:90]}")
            return ref
        except Exception as e:  # noqa: BLE001
            await ctx.log(f"[B] asset resolution failed ({e}) — legacy bait URL.", level="warning")
            return _VIOLATION_FALLBACK_URL

    async def _analyze_b_sample(self, tag: str, ctx, result: dict, rows: list[dict]) -> Optional[bool]:
        """HEAD-probe the pre-allocated object + drive the real salvage; record a row."""
        mapped = result.get("mapped_status")
        raw_status = result.get("raw_status")
        url = result.get("url")
        pre_url = result.get("pre_url")
        job_id = result.get("job_id") or "unknown"
        candidate = url or pre_url
        ProviderStatus = ctx.ProviderStatus

        def _row(head: Any, verdict: str, note: str) -> None:
            rows.append({
                "tag": tag, "raw": raw_status, "mapped": getattr(mapped, "value", mapped),
                "candidate": bool(candidate), "head": head, "verdict": verdict, "note": note,
            })

        if mapped == ProviderStatus.COMPLETED:
            await ctx.log(f"[{tag}] SKIP — did NOT trip moderation (COMPLETED).")
            _row("-", "SKIP", "not filtered (provider non-determinism)")
            return None
        if mapped not in (ProviderStatus.FILTERED, ProviderStatus.FAILED):
            await ctx.log(f"[{tag}] SKIP — odd status {getattr(mapped, 'value', mapped)} (raw={raw_status!r}).")
            _row("-", "SKIP", "odd status (provider variance)")
            return None

        original_status = mapped.value  # "filtered" | "failed"
        probe = None
        if candidate and str(candidate).startswith("http") and not ctx.is_placeholder(candidate):
            probe = await ctx.cdn_head_probe(candidate)
        placeholder = bool(candidate) and ctx.is_placeholder(candidate)
        await ctx.log(f"[{tag}] {original_status!r} HEAD probe -> {probe!r} placeholder={placeholder} candidate={candidate}")

        status_result = ctx.ProviderStatusResult(
            status=mapped, video_url=url, thumbnail_url=None,
            metadata={"provider_status": raw_status, "is_image": True},
        )
        submission = _build_synthetic_submission(job_id, candidate)
        try:
            recovered = await ctx.salvage(
                submission=submission, status_result=status_result,
                poll_cache={}, original_status=original_status,
            )
        except Exception as e:  # noqa: BLE001
            await ctx.log(f"[{tag}] SKIP — salvage raised against live data: {e}", level="warning")
            _row(probe, "SKIP", f"salvage raised: {str(e)[:50]}")
            return None

        meta = status_result.metadata or {}
        await ctx.log(f"[{tag}] salvage recovered={recovered} result_status={status_result.status.value} metadata={meta}")
        head_repr = "200" if probe is True else "placeholder" if placeholder else ("404" if probe is False else "inconclusive")

        if probe is True and not placeholder:
            ok = (
                recovered is True
                and status_result.status == ProviderStatus.COMPLETED
                and meta.get("image_false_filter_recovered") is True
                and ctx.is_early_cdn_terminal(meta)
                and meta.get("video_original_status") == original_status
            )
            if ok and original_status == "filtered":
                ok = ctx.is_early_cdn_filtered(meta) is True
                contract = "filtered->billing SKIPPED + provider_flagged"
            elif ok:
                ok = ctx.is_early_cdn_filtered(meta) is False
                contract = "failed->normal billing, not flagged"
            else:
                contract = "contract mismatch"
            if ok:
                await ctx.log(f"[{tag}] PASS — false filter; salvage RECOVERED consistently ({contract}).")
                _row(head_repr, "PASS", f"recovered ({contract})")
                return True
            await ctx.log(f"[{tag}] FAIL — object served (HEAD 200) but salvage did NOT recover per contract.", level="warning")
            _row(head_repr, "FAIL", "served but not recovered per contract")
            return False

        if recovered is False and status_result.status == mapped:
            await ctx.log(f"[{tag}] PASS — object not retrievable ({head_repr}); left {mapped.value} (fail-safe).")
            _row(head_repr, "PASS", f"genuine filter; left {mapped.value}")
            return True
        if probe is None:
            await ctx.log(f"[{tag}] SKIP — HEAD inconclusive (5xx/timeout).")
            _row(head_repr, "SKIP", "HEAD inconclusive")
            return None
        await ctx.log(f"[{tag}] FAIL — object did not serve yet salvage recovered={recovered} — inconsistent.", level="warning")
        _row(head_repr, "FAIL", "not served yet recovered")
        return False

    async def _observe_extra_recovery_paths(self, tag: str, client: Any, ctx, result: dict) -> None:
        """Five purely-observational sub-probes (not asserted)."""
        candidate = result.get("url") or result.get("pre_url")
        urls_seen: list[str] = result.get("urls_seen") or []
        thumbs_seen: list[str] = result.get("thumbs_seen") or []
        job_id = result.get("job_id")

        async def probe_with_get_fallback(url: str) -> dict:
            head = await ctx.cdn_head_probe(url)
            if head is True:
                return {"head": True, "get": "-", "differs": False}
            get_res = await self._cdn_get_probe(url)
            return {"head": head, "get": get_res, "differs": get_res is True}

        # (1) Thumbnails.
        for t in thumbs_seen:
            if isinstance(t, str) and t.startswith("http") and not ctx.is_placeholder(t):
                pr = await probe_with_get_fallback(t)
                await ctx.emit("observation", {"source": "extra_thumb", "label": tag, "url": t, **pr})

        # (2) Distinct earlier URLs (drift) beyond the main candidate.
        for u in urls_seen:
            if u != candidate and isinstance(u, str) and u.startswith("http") and not ctx.is_placeholder(u):
                pr = await probe_with_get_fallback(u)
                await ctx.emit("observation", {"source": "extra_url_drift", "label": tag, "url": u, **pr})

        # (3) Time-series re-probe on the main candidate (stop on first positive).
        if candidate and isinstance(candidate, str) and candidate.startswith("http") and not ctx.is_placeholder(candidate):
            start = time.monotonic()
            first_positive_at: Optional[float] = None
            first_positive_via: Optional[str] = None
            for target_at in (0, 2, 5, 10, 20, 30):
                if ctx.cancel_event.is_set():
                    break
                elapsed = time.monotonic() - start
                if elapsed < target_at:
                    await asyncio.sleep(target_at - elapsed)
                pr = await probe_with_get_fallback(candidate)
                at = round(time.monotonic() - start, 1)
                await ctx.emit("observation", {"source": "extra_time_series", "label": tag, "t": at, **pr})
                if pr["head"] is True:
                    first_positive_at, first_positive_via = at, "HEAD"
                    break
                if pr["differs"]:
                    first_positive_at, first_positive_via = at, "GET-only"
                    break
            await ctx.emit("observation", {
                "source": "extra_time_series_result", "label": tag,
                "first_positive_at": first_positive_at, "via": first_positive_via,
            })

        # (4) List-endpoint URL comparison.
        if job_id:
            try:
                list_res = await ctx.scan_image_list(client, str(job_id), max_pages=5)
            except Exception as e:  # noqa: BLE001
                await ctx.emit("observation", {"source": "extra_list_endpoint", "label": tag, "error": str(e)[:120]})
            else:
                list_url = list_res.video_url
                matched = (list_res.metadata or {}).get("matched")
                mapped_list = getattr(list_res.status, "value", list_res.status)
                row: dict[str, Any] = {
                    "source": "extra_list_endpoint", "label": tag,
                    "matched": matched, "status": mapped_list, "url": list_url,
                }
                if list_url and isinstance(list_url, str) and list_url.startswith("http") and not ctx.is_placeholder(list_url):
                    pr = await probe_with_get_fallback(list_url)
                    row.update({**pr, "same_as_candidate": list_url == candidate})
                await ctx.emit("observation", row)

    @staticmethod
    async def _cdn_get_probe(url: str) -> Optional[bool]:
        """Streaming GET probe — catches CDN edges that HEAD-404 during propagation."""
        import httpx

        if not url or not url.startswith(("http://", "https://")):
            return None
        try:
            async with httpx.AsyncClient(
                timeout=4.0, follow_redirects=True, headers={"User-Agent": "PixSim7/1.0"},
            ) as cli:
                async with cli.stream("GET", url) as r:
                    code = r.status_code
            if 200 <= code < 300:
                return True
            if 400 <= code < 500:
                return False
            return None
        except Exception:  # noqa: BLE001
            return None
