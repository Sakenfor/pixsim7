"""Shared core for recovering pre-fix lost Pixverse IMAGE generations.

Pixverse returns image_status 7/8/9 (filtered/failed) and a permanently
stale "processing" for a meaningful fraction of jobs that actually
rendered — the integer status lies, the pre-allocated CDN object is
ground truth. The forward fix
(:func:`provider_service._try_pixverse_image_cdn_salvage` + the
terminal-salvage deferral in ``check_status``) recovers these going
forward; this module finds + re-arms the ones lost *before* the fix
shipped, or that landed terminal CANCELLED (most commonly quickgen
burst-cancel of superseded in-flight probes) where no later poll tick
ever re-probed.

Recovery does NOT reimplement asset creation. ``rearm_generation``
re-arms a recoverable generation for the live poller (status=PROCESSING,
started_at = now-150s so the PROCESSING-salvage elapsed gate is already
satisfied yet well under the 2h timeout, attempt_id pointed at the
submission whose CDN object exists, cancel intent cleared). The
already-deployed forward fix then performs the actual recovery through
the real pipeline — billing-skip, provider_flagged, moderation-recheck
all handled correctly, zero logic duplicated.

This is the single implementation shared by the CLI tool
(``tools/backfill_recover_filtered_images.py``) and any maintenance
endpoint: the tool owns argparse / progress-cursor / console output,
this module owns the DB query + CDN probe + re-arm mutation.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional

import httpx
from sqlalchemy import desc, select

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.assets import Asset
from pixsim7.backend.main.domain.enums import GenerationStatus
from pixsim7.backend.main.domain.providers import ProviderSubmission
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    is_pixverse_placeholder_url as _is_placeholder,
)
from pixsim7.backend.main.shared.operation_mapping import get_image_operations
from pixsim_logging import configure_logging

logger = configure_logging("pixverse_image_recovery").bind(channel="pipeline")

# Re-arm started_at offset: older than the 90s PROCESSING-salvage elapsed
# gate (so that fallback path is reachable on the first poll tick even if
# live get_image no longer returns a clean 7/8/9), far younger than the
# 2h stuck-PROCESSING timeout.
_REARM_AGE_SECONDS = 150

# Bulk-scan defaults. These chains have 60-70 attempts; the rendered one
# is almost always recent, so the per-gen probe cap stays modest.
DEFAULT_PROBE_CONCURRENCY = 16
DEFAULT_MAX_PROBES_PER_GEN = 40

# Statuses a genuine-but-lost rendered image can be parked in. CANCELLED
# is included because a job removed from the poll set the instant it goes
# terminal (quickgen burst-cancel, retries-exhausted, deferred cancel)
# lands CANCELLED, not FAILED — invisible to a FAILED-only scan yet just
# as recoverable: the ori object persists for hours.
_RECOVERABLE_STATUSES = (GenerationStatus.FAILED, GenerationStatus.CANCELLED)


@dataclass(frozen=True)
class RecoverableMatch:
    """The most-recent submission of a generation whose pre-allocated CDN
    object still serves a real image."""

    submission: ProviderSubmission
    url: str
    provider_status: Any


class RearmStatus(str, Enum):
    REARMED = "rearmed"
    # Already recovered / no longer terminal (idempotent re-run, or a
    # concurrent poll resolved it).
    SKIPPED_RESOLVED = "skipped_resolved"
    # Recoverable submission isn't the latest of a positive attempt id, so
    # the poller wouldn't select it — needs manual handling.
    SKIPPED_NOT_TARGETABLE = "skipped_not_targetable"


async def query_candidate_generations(
    session,
    *,
    since_days: int,
    limit: Optional[int] = None,
    before: Optional[datetime] = None,
) -> list[Generation]:
    """Terminal (FAILED/CANCELLED) asset-less pixverse IMAGE generations,
    newest first. DB-only (no network) — safe for a count/stats path.

    ``before`` pages strictly older than the given created_at (for
    cursor-style batching managed by the caller).
    """
    image_ops = list(get_image_operations())
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)

    q = (
        select(Generation)
        .where(Generation.provider_id == "pixverse")
        .where(Generation.operation_type.in_(image_ops))
        .where(Generation.status.in_(_RECOVERABLE_STATUSES))
        .where(Generation.created_at >= cutoff)
        .order_by(desc(Generation.created_at))
    )
    if before is not None:
        q = q.where(Generation.created_at < before)
    if limit:
        q = q.limit(limit)
    gens = (await session.execute(q)).scalars().all()

    out: list[Generation] = []
    for g in gens:
        asset = await session.get(Asset, g.asset_id) if g.asset_id else None
        if not (asset and (asset.remote_url or asset.local_path)):
            out.append(g)
    return out


def extract_candidate_urls(resp: Any) -> list[str]:
    """Pre-allocated CDN urls stamped in a submission response (dedup,
    in priority order)."""
    if not isinstance(resp, dict):
        return []
    urls: list[str] = []
    for k in ("asset_url", "image_url", "video_url"):
        v = resp.get(k)
        if isinstance(v, str) and v.startswith("http"):
            urls.append(v)
    meta = resp.get("metadata")
    if isinstance(meta, dict):
        for k in ("asset_url", "image_url"):
            v = meta.get(k)
            if isinstance(v, str) and v.startswith("http"):
                urls.append(v)
    return list(dict.fromkeys(urls))


def make_probe_client(concurrency: int = DEFAULT_PROBE_CONCURRENCY) -> httpx.AsyncClient:
    """One pooled keep-alive client for the whole scan. ``cdn_head_probe``
    spins a fresh AsyncClient (new TLS handshake) per call — fine for the
    prod poll path's occasional probe, ruinous for a bulk scan of 60-70
    URLs per generation. Reuse connections to media.pixverse.ai instead."""
    return httpx.AsyncClient(
        timeout=4.0,
        follow_redirects=True,
        headers={"User-Agent": "PixSim7/1.0"},
        limits=httpx.Limits(
            max_connections=concurrency,
            max_keepalive_connections=concurrency,
        ),
    )


async def probe_url(client: httpx.AsyncClient, sem: asyncio.Semaphore, url: str) -> bool:
    """True iff the CDN object serves (2xx). 4xx = genuine non-result;
    anything else (timeout/5xx) treated as not-recoverable for the scan."""
    async with sem:
        try:
            r = await client.head(url)
            return 200 <= r.status_code < 300
        except Exception:
            return False


async def find_recoverable(
    session,
    gen: Generation,
    *,
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    max_probes: int = DEFAULT_MAX_PROBES_PER_GEN,
) -> Optional[RecoverableMatch]:
    """Most-recent submission of ``gen`` whose pre-allocated CDN object
    still serves a real image, else ``None``. Probes concurrently,
    newest-first, capped."""
    subs = (
        await session.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == gen.id)
            .order_by(desc(ProviderSubmission.submitted_at))
        )
    ).scalars().all()

    # Newest-first candidate (submission, url, provider_status), capped.
    cands: list[tuple[ProviderSubmission, str, Any]] = []
    for s in subs:
        if not s.provider_job_id:
            continue
        resp = s.response if isinstance(s.response, dict) else {}
        meta = resp.get("metadata") if isinstance(resp.get("metadata"), dict) else {}
        ps = resp.get("provider_status") or meta.get("provider_status")
        for url in extract_candidate_urls(resp):
            if _is_placeholder(url):
                continue
            cands.append((s, url, ps))
            if len(cands) >= max_probes:
                break
        if len(cands) >= max_probes:
            break

    if not cands:
        return None

    results = await asyncio.gather(
        *[probe_url(client, sem, url) for (_s, url, _ps) in cands]
    )
    # cands is newest-first; first hit is the most-recent recoverable.
    for (s, url, ps), ok in zip(cands, results):
        if ok:
            return RecoverableMatch(submission=s, url=url, provider_status=ps)
    return None


async def _is_targetable(session, gen: Generation, sub: ProviderSubmission) -> bool:
    """The poller selects the latest submission of generation.attempt_id.
    Re-arm only works cleanly when ``sub`` has a positive attempt id and is
    the latest submission within it (true for ~1-per-attempt retry chains)."""
    aid = sub.generation_attempt_id
    if not isinstance(aid, int) or aid <= 0:
        return False
    latest = (
        await session.execute(
            select(ProviderSubmission.id)
            .where(ProviderSubmission.generation_id == gen.id)
            .where(ProviderSubmission.generation_attempt_id == aid)
            .order_by(desc(ProviderSubmission.submitted_at))
            .limit(1)
        )
    ).scalar()
    return latest == sub.id


async def rearm_generation(
    session,
    *,
    generation_id: int,
    submission: ProviderSubmission,
) -> RearmStatus:
    """Re-arm one recoverable generation for the live poller and commit.

    Re-fetches under the session (guards against a concurrent poll having
    resolved it), enforces the targetability invariant, then flips it to
    PROCESSING with a backdated ``started_at`` and the cancel intent
    cleared so the poller's deferred-cancel finalize / ``_has_pending_cancel``
    can't re-terminate it before the salvage tick runs. Idempotent — safe
    to call repeatedly; a no-longer-terminal row is skipped, not mutated.
    """
    gen = await session.get(Generation, generation_id)
    if gen is None or gen.asset_id or gen.status not in _RECOVERABLE_STATUSES:
        return RearmStatus.SKIPPED_RESOLVED
    if not await _is_targetable(session, gen, submission):
        return RearmStatus.SKIPPED_NOT_TARGETABLE

    gen.status = GenerationStatus.PROCESSING
    gen.started_at = datetime.now(timezone.utc) - timedelta(
        seconds=_REARM_AGE_SECONDS
    )
    gen.attempt_id = submission.generation_attempt_id
    gen.error_code = None
    # Clear lingering cancel intent (CANCELLED rows from quickgen
    # burst-cancel may still carry these).
    gen.deferred_action = None
    gen.cancel_requested_at = None
    await session.commit()

    logger.info(
        "pixverse_image_recovery_rearmed",
        generation_id=gen.id,
        submission_id=submission.id,
        provider_job_id=submission.provider_job_id,
        attempt_id=submission.generation_attempt_id,
    )
    return RearmStatus.REARMED
