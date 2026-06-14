"""
Status poller worker - checks generation status on providers

Runs periodically to:
1. Find generations in PROCESSING state
2. Check status with provider
3. Create assets when completed
4. Update generation status
"""
import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, distinct, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderSubmission, ProviderAccount
from pixsim7.backend.main.domain.enums import (
    AccountStatus,
    BillingState,
    GenerationStatus,
    ProviderStatus,
    OperationType,
    GenerationErrorCode,
)
from pixsim7.backend.main.shared.operation_mapping import (
    get_image_operations,
    get_video_operations,
)
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.workers._poller_backoff import (
    _TransientPollBackoffState,
    _TRANSIENT_POLL_BACKOFF_STEPS_SEC,
    _TRANSIENT_POLL_FAILURE_RESET_SEC,
    _TRANSIENT_POLL_PRUNE_STALE_SEC,
    _POLL_CONCURRENCY_NORMAL,
    _POLL_CONCURRENCY_DEGRADED,
    _POLL_CONCURRENCY_DEGRADE_THRESHOLD,
    _NON_TRANSIENT_POLL_MAX_FAILURES,
    _NON_TRANSIENT_POLL_BACKOFF_STEPS_SEC,
    _BACKOFF_DICT_MAX_SIZE,
    _transient_poll_backoff,
    _non_transient_poll_backoff,
    _iter_exception_chain,
    _is_transient_network_error,
    _is_transient_provider_poll_error,
    _transient_poll_key,
    _get_transient_poll_backoff_remaining,
    _record_transient_poll_backoff,
    _clear_transient_poll_backoff,
    _prune_poll_backoff_dicts,
    _record_non_transient_poll_backoff,
    _get_non_transient_poll_backoff_remaining,
    _record_adaptive_poll_defer,
    _get_adaptive_poll_defer_remaining,
    _clear_adaptive_poll_defer,
    _active_transient_poll_backoffs,
)
from pixsim7.backend.main.workers._poller_snapshots import (
    _AccountCapacitySnapshot,
    _PendingGenerationSnapshot,
    _ProcessingGenerationSnapshot,
    _PollGenerationResult,
    _GenerationSubmissionSnapshot,
    _to_account_capacity_snapshots,
    _to_pending_generation_snapshots,
    _to_processing_generation_snapshots,
    _submission_snapshot_query,
    _snapshot_age_seconds,
    _normalize_for_attempt_compare,
    _parse_submission_attempt_started_at,
    _submission_matches_generation_attempt,
    _submission_matches_generation_attempt_id,
    _submission_is_likely_current_attempt,
    _select_current_attempt_submission,
    _map_submit_error_to_generation_error_code,
    _ensure_aware,
    _is_stale_unsubmitted_error_submission,
    _load_processing_generation_snapshots,
    _load_processing_generation_snapshot,
)
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis, AnalysisStatus
from pixsim7.backend.main.services.generation import GenerationService, GenerationBillingService
from pixsim7.backend.main.services.analysis import AnalysisService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.asset import AssetService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db, get_async_session
from pixsim7.backend.main.infrastructure.queue import (
    clear_generation_wait_metadata,
    enqueue_generation_fresh_job,
    enqueue_generation_retry_job,
    GENERATION_RETRY_QUEUE_NAME,
    get_generation_wait_metadata,
)
from pixsim7.backend.main.shared.debug import (
    get_global_debug_logger,
    load_global_debug_from_env,
)
from pixsim7.backend.main.shared.errors import ProviderError
from pixsim7.backend.main.workers.job_processor_account import (
    refresh_account_credits_best_effort,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)
from pixsim7.backend.main.services.asset.events import ASSET_UPDATED
from pixsim7.backend.main.services.provider.early_cdn import (
    is_early_cdn_filtered,
    is_early_cdn_terminal,
)
from pixsim7.backend.main.services.provider.cdn_probe import cdn_head_probe
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    is_pixverse_placeholder_url,
)
from pixsim7.backend.main.workers.worker_concurrency import (
    seed_agnostic_prompt_group_hash,
    bump_filtered_retry_count,
    clear_filtered_retry_count,
)
from pixsim7.backend.main.services.provider.pixverse_image_recovery import (
    RearmStatus,
    sweep_and_rearm_sibling,
)
from pixsim7.backend.main.domain.providers.registry import registry as _provider_registry

logger = configure_logging("worker").bind(channel="pipeline", domain="provider")
_poller_debug_initialized = False


# Cancel grace period: time the poller waits — after a deferred cancel was
# requested — for the current provider poll to reach a terminal status before
# forcefully transitioning to CANCELLED.  The reference timestamp lives on
# Generation.cancel_requested_at so the timer survives worker restarts.

# Operation classes for grace-period selection.  Image ops finish in seconds;
# video ops can legitimately run for a minute+ so deserve more slack.
_IMAGE_OP_TYPES = frozenset({
    "text_to_image",
    "image_to_image",
    "image_edit",
    "image_composite",
    "frame_extraction",
})
_VIDEO_OP_TYPES = frozenset({
    "text_to_video",
    "image_to_video",
    "video_extend",
    "video_transition",
    "video_modify",
})


def _is_partner_interrupted_filter(status_result: Any, generation: Any) -> bool:
    """Detect Pixverse fal-proxied partner-interrupt (video_status=8 on grok-imagine,
    happyhorse-1.0, etc.).

    The partner accepted the job and refused mid-stream — Pixverse UI labels this
    "generation interrupted." Distinct from a regular content filter: the input
    is the trigger, so retrying the same input is futile. We don't get a
    structured reason from fal, so we can't say *what* (prompt vs image vs
    other partner policy) was rejected — just that the partner refused.

    Returns True only when both signals are present:
      - status_result.metadata.provider_status == 8 (raw int)
      - the generation's model is registered as fal_proxied in the SDK spec

    Conservative on missing data: anything ambiguous returns False, so the
    caller falls through to CONTENT_FILTERED (which retries — keeps existing
    behavior for unknown shapes).
    """
    metadata = getattr(status_result, "metadata", None) or {}
    raw_provider_status = metadata.get("provider_status")
    if raw_provider_status != 8:
        return False
    canonical = getattr(generation, "canonical_params", None) or {}
    model = canonical.get("model")
    if not isinstance(model, str) or not model:
        return False
    try:
        from pixverse.models import VideoModel  # type: ignore
        spec = VideoModel.get(model)
        return bool(spec and getattr(spec, "fal_proxied", False))
    except Exception:
        return False


def _cancel_grace_period_for(operation_type: Any) -> int:
    """Cancel grace period (seconds) keyed by operation class.

    Image ops (i2i/t2i/edit) get a short window so cancel is responsive on
    fast generations; video ops get a longer window so near-complete runs
    can finish naturally.  Anything else (e.g., FUSION) falls back to the
    default.
    """
    from pixsim7.backend.main.services.generation.worker_settings import get_worker_settings
    ws = get_worker_settings()
    op_value: str | None = None
    if operation_type is not None:
        op_value = getattr(operation_type, "value", None) or str(operation_type)
    if op_value in _IMAGE_OP_TYPES:
        value = getattr(ws, "image_op_cancel_grace_period_seconds", None)
        if isinstance(value, int) and value > 0:
            return value
    if op_value in _VIDEO_OP_TYPES:
        value = getattr(ws, "video_op_cancel_grace_period_seconds", None)
        if isinstance(value, int) and value > 0:
            return value
    return int(getattr(ws, "cancel_grace_period_seconds", 30) or 30)


# C+ cancel-salvage window (seconds). Must exceed the committed image
# PROCESSING-fallback elapsed gate (90s for non-qwen/seedream models) plus
# a poll tick, so that salvage path can fire before a deferred cancel is
# finalised for a pixverse image that may have rendered post-cancel.
_IMAGE_CANCEL_SALVAGE_WINDOW_SEC = 120

# Periodic sibling-sweep cadence during the deferred-cancel grace window.
# The cutoff (at end of grace) is the documented chokepoint, but a transient
# CDN/probe failure on that single attempt loses an otherwise-recoverable
# sibling image. Re-running the sweep at this interval during the grace
# gives multiple chances. Pixverse images only (sweep is no-op elsewhere).
_CANCEL_GRACE_SIBLING_SWEEP_INTERVAL_SEC = 30
_CANCEL_GRACE_SIBLING_SWEEP_MAX_SIZE = 5000


def _effective_cancel_grace(
    *,
    base_grace_sec: int,
    provider_id: str | None,
    operation_type: Any,
    has_provider_job: bool,
) -> int:
    """Cancel-finalisation window, widened for recoverable-candidate images.

    A pixverse image generation that actually got a provider job may still
    render after the short (15s) image cancel grace; widen the window so
    the committed PROCESSING/FILTERED CDN salvage can fire during continued
    polling before the deferred cancel is finalised. Everything else keeps
    the base grace.
    """
    if (
        provider_id == "pixverse"
        and has_provider_job
        and operation_type in get_image_operations()
    ):
        return max(base_grace_sec, _IMAGE_CANCEL_SALVAGE_WINDOW_SEC)
    return base_grace_sec

# In-flight guard: prevents overlapping poll cycles from processing
# the same generation concurrently (important at ≤2s poll intervals).
_poll_in_flight: set[int] = set()  # generation IDs currently being polled

# Delayed moderation re-check: after a video completes, re-check status
# at staggered intervals to detect post-delivery flagging by Pixverse.
# Key: asset_id, Value: (provider_job_id, account_id, monotonic_deadline, generation_id, attempt, operation_type, provider_id)
_moderation_recheck: dict[int, tuple[str, int, float, int, int, OperationType, str]] = {}
# Staggered delays: 90s, 3min, 5min — catches flagging that happens up to ~5min post-delivery
_MODERATION_RECHECK_DELAYS_SEC = (90, 180, 300)
_MODERATION_RECHECK_MAX_ATTEMPTS = len(_MODERATION_RECHECK_DELAYS_SEC)
# Shorter first-attempt delay for early-CDN-terminal completions: Pixverse
# typically issues the refund within 15-30 s of our early grab.  The
# known-flagged fast-path schedules a follow-up if the first refresh lands
# before the refund is processed.
_EARLY_CDN_RECHECK_DELAY_SEC = 15
# Follow-up delay for the known-flagged fast-path — catches refunds that
# hadn't landed by the first recheck.
_KNOWN_FLAGGED_FOLLOWUP_DELAY_SEC = 60

# Filtered-video salvage: a pixverse job that reports FILTERED (status 7) may
# still have rendered a real video whose /ori/ CDN file lands a couple seconds
# AFTER the placeholder swap (measured via the early-cdn-webapi diagnostic: the
# real URL 404s for ~2-3s, then turns 200 for genuinely-rendered jobs; for
# truly-moderated jobs it stays 404). Re-probe the preserved real URL for this
# bounded window before finalizing — a 200 means we can salvage the video; a
# persistent 404 earns the distinct, non-retryable CONTENT_RENDER_MODERATED.
#
# Latency: the common fast-filter (job never exposed a real URL) skips the probe
# entirely and finalizes immediately — only the ambiguous "real URL captured
# then 404" case pays this window, and it exits the instant a probe returns 200.
# Terminal detection already lags render completion, so the CDN state is usually
# settled by the first probe; the window just covers the measured ~2-3s
# propagation with margin. Polls run concurrently (semaphore-bounded
# asyncio.gather), so this blocks one slot, not the whole cycle.
_FILTERED_VIDEO_SALVAGE_PROBE_SEC = 4.0
_FILTERED_VIDEO_SALVAGE_PROBE_INTERVAL_SEC = 1.0


async def _maybe_salvage_filtered_pixverse_video(
    *,
    db: Any,
    status_result: Any,
    submission: Any,
    generation: Any,
) -> bool:
    """Re-probe a FILTERED pixverse video's real CDN URL for a late 200.

    The real ``/ori/`` URL is preserved on the submission response even after
    the placeholder swap (see ``_merge_video_url_preferring_retrievable``). If a
    HEAD probe of it returns 200 within the salvage window, the video really
    rendered (moderation only flagged it) — promote it to an early-CDN-filtered
    COMPLETED: mutate ``status_result`` AND persist the completed shape onto
    ``submission.response`` (the caller's COMPLETED branch ``db.refresh``es the
    submission, so an in-memory-only mutation would be lost). ``create_from_
    submission`` then builds the asset from the real URL and the stamped
    ``video_early_cdn_terminal`` flag skips local billing (Pixverse refunds).

    Returns True when salvaged (``status_result`` mutated to COMPLETED), else
    False (caller finalizes the job as terminal).
    """
    if getattr(submission, "provider_id", None) != "pixverse":
        return False
    candidate = (
        status_result.video_url
        or (submission.response or {}).get("video_url")
        or (submission.response or {}).get("asset_url")
    )
    if not candidate or is_pixverse_placeholder_url(candidate):
        return False

    loop = asyncio.get_event_loop()
    deadline = loop.time() + _FILTERED_VIDEO_SALVAGE_PROBE_SEC
    attempts = 0
    last_probe: bool | None = None
    while True:
        attempts += 1
        last_probe = await cdn_head_probe(candidate)
        if last_probe is True:
            status_result.status = ProviderStatus.COMPLETED
            status_result.video_url = candidate
            meta = dict(status_result.metadata or {})
            meta["video_early_cdn_terminal"] = True
            meta["video_original_status"] = "filtered"
            meta["has_retrievable_media_url"] = True
            status_result.metadata = meta

            # Persist the completed shape so the COMPLETED branch's
            # db.refresh(submission) + create_from_submission see a real,
            # retrievable, early-CDN-filtered video (not the placeholder).
            response = dict(submission.response or {})
            response["status"] = ProviderStatus.COMPLETED.value
            response["video_url"] = candidate
            response["asset_url"] = candidate
            response["metadata"] = {**(response.get("metadata") or {}), **meta}
            submission.response = response
            flag_modified(submission, "response")
            await db.commit()

            logger.info(
                "pixverse_filtered_video_salvaged",
                generation_id=generation.id,
                submission_id=submission.id,
                probe_attempts=attempts,
                url_preview=str(candidate)[:120],
            )
            return True
        if loop.time() >= deadline:
            logger.info(
                "pixverse_filtered_video_not_salvageable",
                generation_id=generation.id,
                submission_id=submission.id,
                probe_attempts=attempts,
                last_probe=last_probe,  # False=404 (gone), None=inconclusive
                url_preview=str(candidate)[:120],
            )
            return False
        await asyncio.sleep(_FILTERED_VIDEO_SALVAGE_PROBE_INTERVAL_SEC)

# Per-generation monotonic deadline for the next within-grace sibling sweep
# (see _maybe_finalize_deferred_cancel). Stored as gen_id -> monotonic float;
# entries are cleaned up on cancel finalize / sibling recovery / cancel
# cleared, with hard-cap eviction in _prune_transient_poll_backoff.
_cancel_grace_sibling_sweep_deadline: dict[int, float] = {}


def _has_pending_cancel(generation_model: Any) -> bool:
    """Check if a generation has a pending cancel (deferred action or already cancelled)."""
    if generation_model is None:
        return False
    return (
        generation_model.status == GenerationStatus.CANCELLED
        or generation_model.deferred_action == "cancel"
    )


# Adaptive poll cadence for Pixverse video ops.  Tiered by elapsed-since-
# submit: tight at the edges (catch early-CDN + catch completion), relaxed
# in the middle of a long render when nothing is happening.  Tuple entries
# are ``(elapsed_cap_seconds, defer_seconds)``; a ``None`` cap applies to
# everything beyond the last tier.
_ADAPTIVE_POLL_TIERS_PIXVERSE_VIDEO: tuple[tuple[float | None, int], ...] = (
    (20.0, 2),     # first 20 s: every tick — catch early-CDN window
    (75.0, 4),     # 20 s - 1:15: half cadence
    (180.0, 6),    # 1:15 - 3:00: a third cadence (mid-render lull)
    (None, 4),     # 3:00+: back to half cadence — likely close to completion
)


def _compute_adaptive_poll_defer_seconds(
    *,
    provider_id: str | None,
    operation_type: Any,
    generation_started_at: Any,
    now: datetime,
) -> int:
    """Return seconds to defer before the next poll; 0 = no throttling.

    Only Pixverse video ops get adaptive cadence.  Image ops are usually
    fast enough that every-tick polling is fine, and non-Pixverse providers
    haven't been characterised yet.  Video_extend IS included here — its
    opt-out from the batched list path is about silent-filter metadata
    stamping, not cadence.
    """
    if provider_id != "pixverse":
        return 0
    if operation_type not in get_video_operations():
        return 0
    if generation_started_at is None:
        return 0
    try:
        elapsed = (now - generation_started_at).total_seconds()
    except Exception:
        return 0
    if elapsed < 0:
        return 0
    for cap, defer in _ADAPTIVE_POLL_TIERS_PIXVERSE_VIDEO:
        if cap is None or elapsed < cap:
            return defer
    return 0



def _moderation_recheck_eligible(
    *,
    media_type: str | None,
    is_early_cdn: bool,
    has_provider_job_id: bool,
) -> bool:
    """Whether a completed asset should get a post-delivery moderation recheck.

    Videos: always (Pixverse retro-flags delivered videos). Images: only the
    early-CDN *salvaged* ones — they need the Pixverse auto-refund reconciled
    (status-7 -> provider_flagged + billing skipped) and post-delivery
    flagging caught. Cleanly-completed images are skipped (Pixverse rarely
    retro-pulls a normal image; blanket image recheck would add a probe per
    generation).
    """
    if not has_provider_job_id:
        return False
    if media_type == "video":
        return True
    if media_type == "image":
        return is_early_cdn
    return False


def _schedule_moderation_recheck(
    *,
    asset_id: int,
    provider_job_id: str,
    account_id: int,
    generation_id: int,
    attempt: int,
    operation_type: OperationType,
    provider_id: str,
    delay_sec: float,
) -> None:
    _moderation_recheck[asset_id] = (
        provider_job_id,
        account_id,
        time.monotonic() + delay_sec,
        generation_id,
        attempt,
        operation_type,
        provider_id,
    )


async def _increment_failure_stats_and_release_account(
    db: AsyncSession,
    account_service: AccountService,
    account_id: int,
) -> ProviderAccount:
    """Persist failure counters under row lock, then release the reservation slot."""
    locked = await db.execute(
        select(ProviderAccount).where(ProviderAccount.id == account_id).with_for_update()
    )
    account = locked.scalar_one()
    account.total_videos_failed += 1
    account.failure_streak += 1
    account.success_rate = account.calculate_success_rate()
    await db.commit()
    released_account = await account_service.release_account(account.id)
    await db.commit()
    return released_account


async def _finalize_generation_billing_best_effort(
    db: AsyncSession,
    *,
    generation_id: int,
    generation_model: Any | None,
    final_submission: Any | None,
    account: Any | None,
    actual_duration: float | None = None,
    refresh_generation: bool = False,
) -> None:
    """Best-effort billing finalization shared by generation terminal/failure paths."""
    if generation_model is None:
        return
    try:
        billing_service = GenerationBillingService(db)
        if refresh_generation:
            await db.refresh(generation_model)
        await billing_service.finalize_billing(
            generation=generation_model,
            final_submission=final_submission,
            account=account,
            actual_duration=actual_duration,
        )
    except Exception as billing_err:
        logger.warning(
            "billing_finalization_error",
            generation_id=generation_id,
            error=str(billing_err),
        )


_MODERATION_RECHECK_MAX_SIZE = 5000


def _prune_transient_poll_backoff(*, now_mono: float) -> None:
    """Prune backoff dicts plus moderation-recheck dict."""
    _prune_poll_backoff_dicts(now_mono=now_mono)

    # Hard cap on moderation recheck dict
    if len(_moderation_recheck) > _MODERATION_RECHECK_MAX_SIZE:
        sorted_aids = sorted(
            _moderation_recheck, key=lambda k: _moderation_recheck[k][2]  # monotonic_deadline
        )
        for aid in sorted_aids[: len(_moderation_recheck) - _MODERATION_RECHECK_MAX_SIZE]:
            _moderation_recheck.pop(aid, None)

    # Hard cap on cancel-grace sibling-sweep deadline dict (entries normally
    # clean up via the cancel finalize / recovery paths; this is the safety
    # net if a generation somehow leaves the grace flow without cleanup).
    if len(_cancel_grace_sibling_sweep_deadline) > _CANCEL_GRACE_SIBLING_SWEEP_MAX_SIZE:
        sorted_ids = sorted(
            _cancel_grace_sibling_sweep_deadline,
            key=lambda k: _cancel_grace_sibling_sweep_deadline[k],
        )
        excess = len(_cancel_grace_sibling_sweep_deadline) - _CANCEL_GRACE_SIBLING_SWEEP_MAX_SIZE
        for gen_id in sorted_ids[:excess]:
            _cancel_grace_sibling_sweep_deadline.pop(gen_id, None)


def _processing_generations_snapshot(
    processing_generations: list[_ProcessingGenerationSnapshot],
) -> dict:
    now = datetime.now(timezone.utc)
    by_account: dict[str, int] = {}
    sample: list[dict] = []
    oldest_age_seconds = 0.0

    for generation in processing_generations:
        account_key = str(generation.account_id) if generation.account_id is not None else "unassigned"
        by_account[account_key] = by_account.get(account_key, 0) + 1

        age_seconds = None
        if generation.started_at:
            age_seconds = (now - generation.started_at).total_seconds()
            if age_seconds > oldest_age_seconds:
                oldest_age_seconds = age_seconds

        if len(sample) < 10:
            sample.append(
                {
                    "generation_id": generation.id,
                    "account_id": generation.account_id,
                    "operation_type": getattr(generation.operation_type, "value", generation.operation_type),
                    "started_age_seconds": round(age_seconds, 1) if age_seconds is not None else None,
                }
            )

    return {
        "count": len(processing_generations),
        "oldest_started_age_seconds": round(oldest_age_seconds, 1),
        "by_account": by_account,
        "sample": sample,
    }


def _init_poller_debug_flags() -> None:
    """Initialize global debug flags for the status poller from environment."""
    global _poller_debug_initialized
    if _poller_debug_initialized:
        return
    load_global_debug_from_env()
    _poller_debug_initialized = True


async def _handle_no_submission_case(
    db: AsyncSession,
    *,
    generation: _ProcessingGenerationSnapshot,
    current_attempt_id: int,
    latest_submission_any_attempt: _GenerationSubmissionSnapshot | None,
    generation_service: GenerationService,
    unsubmitted_timeout_threshold: datetime,
    unsubmitted_timeout_minutes: int,
) -> _PollGenerationResult:
    """No submission found for current attempt — handle deferred cancel / unsubmitted timeout."""
    logger.warning(
        "no_current_attempt_submission",
        generation_id=generation.id,
        attempt_id=current_attempt_id,
        has_latest_submission_any_attempt=latest_submission_any_attempt is not None,
        latest_submission_id=(
            latest_submission_any_attempt.id
            if latest_submission_any_attempt
            else None
        ),
        latest_submission_attempt_id=(
            latest_submission_any_attempt.generation_attempt_id
            if latest_submission_any_attempt
            else None
        ),
        generation_started_at=(
            str(generation.started_at) if generation.started_at else None
        ),
    )

    # Check for deferred cancel on unsubmitted generations
    if generation.deferred_action == "cancel":
        gen_model = await db.get(Generation, generation.id)
    else:
        gen_model = None
    if gen_model and gen_model.deferred_action == "cancel":
        logger.info(
            "generation_cancel_before_submission",
            generation_id=generation.id,
        )
        # No submission for the current attempt, but an earlier attempt's
        # job may have rendered before the cancel. On re-arm the row is
        # PROCESSING again, so return early *before* the orphan-counter
        # decrement to keep the account slot.
        if await _maybe_recover_pixverse_image_sibling(
            db,
            generation_id=generation.id,
            operation_type=generation.operation_type,
            provider_id=generation.provider_id,
            selected_submission_id=None,
        ):
            return _PollGenerationResult(
                generation_id=generation.id,
                outcome='still_processing',
            )
        gen_model.deferred_action = None
        await db.commit()
        timeout_account_id = generation.account_id
        if timeout_account_id:
            orphan_account = await db.get(ProviderAccount, timeout_account_id)
            if orphan_account and orphan_account.current_processing_jobs > 0:
                orphan_account.current_processing_jobs -= 1
                await db.commit()
        # Use update_status to emit job:cancelled WebSocket event
        await generation_service.update_status(
            generation.id, GenerationStatus.CANCELLED,
        )
        return _PollGenerationResult(generation_id=generation.id, outcome='failed')

    if generation.started_at and generation.started_at < unsubmitted_timeout_threshold:
        await generation_service.mark_failed(
            generation.id,
            (
                "Generation failed: no submission found for current attempt "
                f"(timed out after {unsubmitted_timeout_minutes} minutes)"
            ),
            error_code=GenerationErrorCode.PROVIDER_UNAVAILABLE.value,
        )

        timeout_account_id = generation.account_id
        if (
            timeout_account_id is None
            and latest_submission_any_attempt is not None
        ):
            timeout_account_id = latest_submission_any_attempt.account_id
        if timeout_account_id:
            orphan_account = await db.get(ProviderAccount, timeout_account_id)
            if orphan_account and orphan_account.current_processing_jobs > 0:
                orphan_account.current_processing_jobs -= 1
                logger.info(
                    "counter_decremented_no_current_attempt_submission",
                    account_id=timeout_account_id,
                    generation_id=generation.id,
                )

        await db.commit()
        return _PollGenerationResult(generation_id=generation.id, outcome='failed')

    return _PollGenerationResult(generation_id=generation.id, outcome='still_processing')


async def _fail_with_timeout(
    db: AsyncSession,
    *,
    generation_id: int,
    failure_reason: str,
    final_submission: Any,
    account: ProviderAccount,
    generation_service: GenerationService,
    account_service: AccountService,
    missing_provider_job: bool,
) -> _PollGenerationResult:
    """Mark generation failed with a timeout reason, finalize billing, release account slot."""
    await generation_service.mark_failed(generation_id, failure_reason)

    generation_model = await db.get(Generation, generation_id)
    await _finalize_generation_billing_best_effort(
        db=db,
        generation_id=generation_id,
        generation_model=generation_model,
        final_submission=final_submission,
        account=account,
    )

    await _increment_failure_stats_and_release_account(
        db=db,
        account_service=account_service,
        account_id=account.id,
    )

    return _PollGenerationResult(
        generation_id=generation_id,
        outcome='failed',
        missing_provider_job=missing_provider_job,
    )


async def _handle_processing_status(
    db: AsyncSession,
    *,
    generation: _ProcessingGenerationSnapshot,
    account: ProviderAccount,
    generation_service: GenerationService,
    account_service: AccountService,
    missing_provider_job: bool,
) -> _PollGenerationResult:
    """PROCESSING status — honour deferred cancel after grace period, else keep polling."""
    if await _maybe_finalize_deferred_cancel(
        db,
        generation=generation,
        account=account,
        generation_service=generation_service,
        account_service=account_service,
    ):
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='failed',
            missing_provider_job=missing_provider_job,
        )
    return _PollGenerationResult(
        generation_id=generation.id,
        outcome='still_processing',
        missing_provider_job=missing_provider_job,
    )


async def _maybe_recover_pixverse_image_sibling(
    db: AsyncSession,
    *,
    generation_id: int,
    operation_type: Any,
    provider_id: str | None,
    selected_submission_id: int | None,
) -> bool:
    """Last-chance superseded-sibling salvage shared by every pixverse
    image finalize site (terminal status + deferred-cancel grace).

    A burst / duplicate submit can leave one generation with two pixverse
    jobs in the same attempt; the poller only ever selects the latest, so
    when an *earlier* sibling is the one that actually rendered it is
    structurally unpollable and every forward salvage path (all bound to
    the selected submission) misses it — the rendered image is lost until
    a manual extension resync (asset 107327 / gen 134026). Probe every
    sibling's pre-allocated CDN object; if a recoverable one is found,
    re-group it into its own attempt and re-arm so the deployed forward
    salvage recovers it through the real pipeline next tick.

    ``selected_submission_id`` is the submission the poller already polled
    this tick (terminal path) — its own object is owned by the forward
    salvage and must not be double-handled here. Pass ``None`` from the
    deferred-cancel path, where recovering *any* rendered sibling
    (including the tracked job that landed post-cancel — the documented
    0781dafdb scenario) is the goal.

    Returns True iff a generation was re-armed (caller must skip
    finalization and keep polling). Defensive — a transient CDN/probe
    failure never blocks a genuine terminal/cancel.
    """
    if provider_id != "pixverse" or operation_type not in get_image_operations():
        return False
    try:
        rearm = await sweep_and_rearm_sibling(
            db,
            generation_id=generation_id,
            selected_submission_id=selected_submission_id,
        )
    except Exception:
        logger.warning(
            "pixverse_sibling_sweep_failed",
            generation_id=generation_id,
            exc_info=True,
        )
        return False
    if rearm in (RearmStatus.REARMED, RearmStatus.REARMED_ISOLATED_SIBLING):
        logger.warning(
            "pixverse_image_recovered_via_superseded_sibling",
            generation_id=generation_id,
            selected_submission_id=selected_submission_id,
            rearm_status=rearm.value,
        )
        return True
    return False


async def _maybe_finalize_deferred_cancel(
    db: AsyncSession,
    *,
    generation: _ProcessingGenerationSnapshot,
    account: ProviderAccount,
    generation_service: GenerationService,
    account_service: AccountService,
) -> bool:
    """Honour a deferred cancel once the per-provider grace period elapses.

    Reads ``Generation.cancel_requested_at`` (persisted at cancel time) so the
    grace timer survives worker restarts.  Returns True iff cancel was
    finalized — the account slot was released and the generation transitioned
    to CANCELLED.  Returns False when no cancel is pending or the grace
    period has not yet elapsed (caller continues normal polling).
    """
    if generation.deferred_action != "cancel":
        _cancel_grace_sibling_sweep_deadline.pop(generation.id, None)
        return False
    generation_model = await db.get(Generation, generation.id)
    if not (generation_model and generation_model.deferred_action == "cancel"):
        _cancel_grace_sibling_sweep_deadline.pop(generation.id, None)
        return False
    now_utc = datetime.now(timezone.utc)
    cancel_requested_at = generation_model.cancel_requested_at
    if cancel_requested_at is None:
        # Pre-migration row or backfill miss — stamp now so the timer starts
        # ticking and survives the next worker restart.
        generation_model.cancel_requested_at = now_utc
        await db.commit()
        cancel_requested_at = now_utc
    elif cancel_requested_at.tzinfo is None:
        cancel_requested_at = cancel_requested_at.replace(tzinfo=timezone.utc)
    elapsed = (now_utc - cancel_requested_at).total_seconds()
    op_type = getattr(generation_model, "operation_type", None) or generation.operation_type
    grace_sec = _cancel_grace_period_for(op_type)
    op_log = getattr(op_type, "value", None) or (str(op_type) if op_type is not None else None)

    # C+ salvage window: the 15s image cancel grace finalises CANCELLED
    # *before* the committed PROCESSING/FILTERED CDN salvage's elapsed gate
    # (45/90s) — so a Pixverse image that renders post-cancel (status stuck
    # at 10 from a consumed notification) is killed before we can recover
    # it. For pixverse image gens that actually got a provider job (so an
    # image could exist), hold finalisation open long enough for the
    # already-deployed salvage to fire during continued polling; the
    # existing "honour completion over pending cancel" path then delivers
    # the asset. Bounded — a genuinely-unrecoverable cancel still finalises,
    # just later. Renders landing minutes after cancel remain out of scope.
    has_provider_job = False
    if generation_model.provider_id == "pixverse" and op_type in get_image_operations():
        has_provider_job = (
            await db.execute(
                select(ProviderSubmission.id)
                .where(ProviderSubmission.generation_id == generation.id)
                .where(ProviderSubmission.provider_job_id.is_not(None))
                .limit(1)
            )
        ).first() is not None
    effective_grace = _effective_cancel_grace(
        base_grace_sec=grace_sec,
        provider_id=generation_model.provider_id,
        operation_type=op_type,
        has_provider_job=has_provider_job,
    )

    if elapsed < effective_grace:
        logger.info(
            "generation_cancel_grace_period",
            generation_id=generation.id,
            operation_type=op_log,
            provider_id=generation_model.provider_id,
            elapsed_sec=round(elapsed, 1),
            grace_period_sec=grace_sec,
            effective_grace_sec=effective_grace,
            grace_remaining_sec=round(effective_grace - elapsed, 1),
        )
        # Belt-and-suspenders: also fire the sibling sweep at intervals
        # during the grace window so a transient CDN/probe failure at the
        # cutoff (below) doesn't lose a recoverable sibling image.  Gated
        # on pixverse + image + provider_job because the sweep is a no-op
        # otherwise and we'd just be doing a DB hit for nothing.
        if (
            has_provider_job
            and generation_model.provider_id == "pixverse"
            and op_type in get_image_operations()
        ):
            now_mono = time.monotonic()
            deadline = _cancel_grace_sibling_sweep_deadline.get(generation.id)
            if deadline is None:
                # First encounter — stamp deadline, defer first sweep one
                # interval so we're not duplicating the forward salvage that
                # already ran on this tick.
                _cancel_grace_sibling_sweep_deadline[generation.id] = (
                    now_mono + _CANCEL_GRACE_SIBLING_SWEEP_INTERVAL_SEC
                )
            elif now_mono >= deadline:
                _cancel_grace_sibling_sweep_deadline[generation.id] = (
                    now_mono + _CANCEL_GRACE_SIBLING_SWEEP_INTERVAL_SEC
                )
                if await _maybe_recover_pixverse_image_sibling(
                    db,
                    generation_id=generation.id,
                    operation_type=op_type,
                    provider_id=generation_model.provider_id,
                    selected_submission_id=None,
                ):
                    _cancel_grace_sibling_sweep_deadline.pop(generation.id, None)
                    return False
        return False
    logger.info(
        "generation_cancel_while_provider_processing",
        generation_id=generation.id,
        operation_type=op_log,
        provider_id=generation_model.provider_id,
        grace_elapsed_sec=round(elapsed, 1),
        grace_period_sec=grace_sec,
    )
    # Grace elapsed — the cancel-grace cutoff where the documented
    # post-cancel-render hole (0781dafdb) bites. selected_submission_id=None
    # so the tracked job (not just burst siblings) counts. Returning False
    # keeps the caller polling without finalizing the cancel. Past the
    # early-return above, so this fires once at the cutoff, not per tick.
    if await _maybe_recover_pixverse_image_sibling(
        db,
        generation_id=generation.id,
        operation_type=op_type,
        provider_id=generation_model.provider_id,
        selected_submission_id=None,
    ):
        _cancel_grace_sibling_sweep_deadline.pop(generation.id, None)
        return False
    generation_model.deferred_action = None
    await db.commit()
    await account_service.release_account(account.id)
    await generation_service.update_status(
        generation.id, GenerationStatus.CANCELLED,
    )
    _cancel_grace_sibling_sweep_deadline.pop(generation.id, None)
    return True


async def _handle_provider_check_error(
    db: AsyncSession,
    error: ProviderError,
    *,
    generation: _ProcessingGenerationSnapshot,
    submission: Any,
    account: ProviderAccount,
    generation_service: GenerationService,
    account_service: AccountService,
    transient_backoff_key: str | None,
    missing_provider_job: bool,
) -> _PollGenerationResult:
    """ProviderError from check_status: classify as transient/non-transient and retry-or-fail."""
    # Honour a deferred cancel even when the provider check is erroring —
    # otherwise a cancel could wait indefinitely for a clean poll if the
    # provider is consistently returning auth/transient errors.
    if await _maybe_finalize_deferred_cancel(
        db,
        generation=generation,
        account=account,
        generation_service=generation_service,
        account_service=account_service,
    ):
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='failed',
            missing_provider_job=missing_provider_job,
        )

    if _is_transient_provider_poll_error(error):
        failure_count, delay_sec = _record_transient_poll_backoff(
            transient_backoff_key or str(generation.id),
            now_mono=time.monotonic(),
        )
        logger.warning(
            "provider_check_error_transient",
            generation_id=generation.id,
            submission_id=submission.id,
            provider_job_id=submission.provider_job_id,
            error=str(error),
            error_type=error.__class__.__name__,
            error_code=getattr(error, "error_code", None),
            retryable=getattr(error, "retryable", None),
            transient_failures=failure_count,
            backoff_s=delay_sec,
        )
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='still_processing',
            missing_provider_job=missing_provider_job,
        )

    # Provider error during status check (auth, session, API).
    # Retry a few times with backoff before failing — a single
    # auth hiccup shouldn't orphan a generation that the provider
    # is still processing.
    nt_key = transient_backoff_key or str(generation.id)
    failure_count, delay_sec = _record_non_transient_poll_backoff(
        nt_key, now_mono=time.monotonic(),
    )

    if failure_count < _NON_TRANSIENT_POLL_MAX_FAILURES:
        logger.warning(
            "provider_check_error_non_transient_retry",
            generation_id=generation.id,
            error=str(error),
            error_type=error.__class__.__name__,
            error_code=getattr(error, "error_code", None),
            non_transient_failures=failure_count,
            max_failures=_NON_TRANSIENT_POLL_MAX_FAILURES,
            backoff_s=delay_sec,
        )
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='still_processing',
            missing_provider_job=missing_provider_job,
        )

    logger.warning(
        "provider_check_error_failing",
        generation_id=generation.id,
        error=str(error),
        error_type=error.__class__.__name__,
        non_transient_failures=failure_count,
    )
    try:
        await generation_service.mark_failed(
            generation.id,
            f"Status check failed: {error}",
            error_code=getattr(error, 'error_code', None) or "poll_provider_error",
        )
        await account_service.release_account(account.id)
        await db.commit()
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='failed',
            missing_provider_job=missing_provider_job,
        )
    except Exception as mark_err:
        logger.error(
            "provider_check_error_mark_failed_error",
            generation_id=generation.id,
            error=str(mark_err),
        )
        return _PollGenerationResult(
            generation_id=generation.id,
            outcome='still_processing',
            missing_provider_job=missing_provider_job,
        )


async def _attempt_last_ditch_recovery(
    *,
    generation: _ProcessingGenerationSnapshot,
    submission: Any,
    account: ProviderAccount,
    operation_type: Any,
    poll_cache: dict,
) -> bool:
    """Deep paginated list-search for a stuck pixverse generation.

    The per-tick batch (1 page) and elapsed-time fallback (5 pages) can
    both miss a completed job whose provider-side history has scrolled
    past page 5 on a busy account. Pixverse's completion notification is
    one-shot — a consumed ack leaves a deep list search as the only
    recovery path. On a terminal hit the result is seeded into the
    per-tick poll_cache so the caller's normal check_status completes it
    instead of failing on the 2-hour timeout. Returns True iff recovered.
    """
    if generation.provider_id != "pixverse" or not submission.provider_job_id:
        return False

    try:
        provider = _provider_registry.get(generation.provider_id)
    except Exception:
        provider = None
    if provider is None:
        return False

    is_image = operation_type in get_image_operations()
    try:
        if is_image and hasattr(provider, "check_image_status_from_list"):
            result = await provider.check_image_status_from_list(
                account=account,
                image_id=submission.provider_job_id,
                max_pages=20,
            )
        elif operation_type in get_video_operations() and hasattr(
            provider, "check_video_status_from_list"
        ):
            result = await provider.check_video_status_from_list(
                account=account,
                video_id=submission.provider_job_id,
                max_pages=20,
            )
        else:
            return False
    except Exception as err:
        logger.warning(
            "generation_last_ditch_search_failed",
            generation_id=generation.id,
            provider_job_id=submission.provider_job_id,
            error=str(err),
        )
        return False

    if result is None or result.status == ProviderStatus.PROCESSING:
        return False

    logger.warning(
        "generation_recovered_via_last_ditch",
        generation_id=generation.id,
        provider_job_id=submission.provider_job_id,
        recovered_status=str(result.status),
        age_hours=round(
            (datetime.now(timezone.utc) - generation.started_at).total_seconds() / 3600,
            2,
        ),
    )
    ProviderService.seed_poll_cache(
        poll_cache,
        account_id=account.id,
        provider_job_id=submission.provider_job_id,
        is_image=is_image,
        result=result,
    )
    return True


async def _poll_single_generation(
    generation: _ProcessingGenerationSnapshot,
    poll_cache: dict[str, object],
    timeout_threshold: datetime,
    unsubmitted_timeout_threshold: datetime,
    mixed_submission_timeout_threshold: datetime,
    timeout_hours: int,
    unsubmitted_timeout_minutes: int,
    mixed_submission_timeout_minutes: int,
) -> _PollGenerationResult:
    """Poll a single generation's status using its own DB session."""
    worker_debug = get_global_debug_logger()
    generation_id = generation.id
    generation_started_at = generation.started_at
    generation_operation_type = generation.operation_type
    missing_provider_job = False
    transient_backoff_key: str | None = None

    async with get_async_session() as db:
        try:
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            provider_service = ProviderService(db)
            account_service = AccountService(db)
            asset_service = AssetService(db, user_service)

            latest_error_submission_without_job_id = None
            (
                submission,
                latest_submission_any_attempt,
                current_attempt_id,
            ) = await _select_current_attempt_submission(db, generation)

            if not submission:
                return await _handle_no_submission_case(
                    db,
                    generation=generation,
                    current_attempt_id=current_attempt_id,
                    latest_submission_any_attempt=latest_submission_any_attempt,
                    generation_service=generation_service,
                    unsubmitted_timeout_threshold=unsubmitted_timeout_threshold,
                    unsubmitted_timeout_minutes=unsubmitted_timeout_minutes,
                )

            account = await db.get(ProviderAccount, submission.account_id)
            if not account:
                logger.error("account_not_found", account_id=submission.account_id)
                await generation_service.mark_failed(generation.id, "Account not found")
                await db.commit()
                return _PollGenerationResult(generation_id=generation_id, outcome='failed')

            if not submission.provider_job_id:
                missing_provider_job = True
                now = datetime.now(timezone.utc)
                submission_age_seconds = _snapshot_age_seconds(
                    submission.submitted_at, now=now
                )
                generation_started_age_seconds = _snapshot_age_seconds(
                    generation.started_at, now=now
                )

                submission_count_query = select(func.count(ProviderSubmission.id)).where(
                    ProviderSubmission.generation_id == generation.id
                )
                previous_valid_query = (
                    _submission_snapshot_query()
                    .where(ProviderSubmission.generation_id == generation.id)
                    .where(ProviderSubmission.provider_job_id.is_not(None))
                )
                if current_attempt_id > 0 and submission.generation_attempt_id is not None:
                    submission_count_query = submission_count_query.where(
                        ProviderSubmission.generation_attempt_id == current_attempt_id
                    )
                    previous_valid_query = previous_valid_query.where(
                        ProviderSubmission.generation_attempt_id == current_attempt_id
                    )

                submission_count_result = await db.execute(submission_count_query)
                submission_count = submission_count_result.scalar() or 0

                previous_valid_result = await db.execute(
                    previous_valid_query
                    .order_by(ProviderSubmission.submitted_at.desc())
                    .limit(1)
                )
                previous_valid_row = previous_valid_result.first()
                previous_valid_submission = (
                    _GenerationSubmissionSnapshot.from_row(tuple(previous_valid_row))
                    if previous_valid_row is not None
                    else None
                )

                response_keys = []
                if isinstance(submission.response, dict):
                    response_keys = list(submission.response.keys())

                logger.warning(
                    "generation_submission_missing_provider_job_id",
                    generation_id=generation.id,
                    submission_id=submission.id,
                    submission_status=submission.status,
                    submission_age_seconds=submission_age_seconds,
                    generation_started_age_seconds=generation_started_age_seconds,
                    submitted_at=str(submission.submitted_at) if submission.submitted_at else None,
                    responded_at=str(submission.responded_at) if submission.responded_at else None,
                    submission_attempt_id=submission.generation_attempt_id,
                    generation_attempt_id=current_attempt_id,
                    response_keys=response_keys,
                    submission_count=submission_count,
                    has_previous_valid_submission=previous_valid_submission is not None,
                    previous_valid_submission_id=(
                        previous_valid_submission.id if previous_valid_submission else None
                    ),
                    previous_valid_provider_job_id=(
                        previous_valid_submission.provider_job_id
                        if previous_valid_submission
                        else None
                    ),
                    previous_valid_submitted_at=(
                        str(previous_valid_submission.submitted_at)
                        if previous_valid_submission and previous_valid_submission.submitted_at
                        else None
                    ),
                )

                # Terminal submit failure: provider submit already responded
                # with an error and no job id. Do not keep polling forever.
                if submission.status == "error" and previous_valid_submission is None:
                    if not _submission_is_likely_current_attempt(generation, submission):
                        logger.info(
                            "generation_skip_non_current_attempt_submission_error",
                            generation_id=generation.id,
                            submission_id=submission.id,
                            generation_attempt_id=current_attempt_id,
                            submission_attempt_id=submission.generation_attempt_id,
                            generation_started_at=(
                                str(generation.started_at) if generation.started_at else None
                            ),
                            submission_attempt_started_at=(
                                submission.response.get("generation_attempt_started_at")
                                if isinstance(submission.response, dict)
                                else None
                            ),
                        )
                        return _PollGenerationResult(
                            generation_id=generation_id,
                            outcome='still_processing',
                            missing_provider_job=True,
                        )

                    # Guard against stale no-job-id submissions from a prior
                    # attempt. A newer attempt may already be PROCESSING but
                    # still in dispatch stagger before creating its next
                    # ProviderSubmission row.
                    latest_submission_is_stale = _is_stale_unsubmitted_error_submission(
                        generation,
                        submission,
                    )
                    if latest_submission_is_stale:
                        logger.info(
                            "generation_skip_stale_unsubmitted_submission_error",
                            generation_id=generation.id,
                            submission_id=submission.id,
                            generation_started_at=(
                                str(generation.started_at) if generation.started_at else None
                            ),
                            submission_submitted_at=(
                                str(submission.submitted_at) if submission.submitted_at else None
                            ),
                            submission_responded_at=(
                                str(submission.responded_at) if submission.responded_at else None
                            ),
                        )
                        return _PollGenerationResult(
                            generation_id=generation_id,
                            outcome='still_processing',
                            missing_provider_job=True,
                        )

                    submit_error = None
                    if isinstance(submission.response, dict):
                        submit_error = (
                            submission.response.get("error_message")
                            or submission.response.get("error")
                        )
                    error_code = _map_submit_error_to_generation_error_code(submission)
                    final_error = (
                        str(submit_error)
                        if submit_error
                        else "Generation failed before provider job ID was assigned"
                    )
                    logger.warning(
                        "generation_failed_unsubmitted_submission_error",
                        generation_id=generation.id,
                        submission_id=submission.id,
                        submission_status=submission.status,
                        error=final_error,
                        error_code=error_code,
                    )
                    await generation_service.mark_failed(
                        generation.id,
                        final_error,
                        error_code=error_code,
                    )

                    generation_model = await db.get(Generation, generation.id)
                    await _finalize_generation_billing_best_effort(
                        db=db,
                        generation_id=generation.id,
                        generation_model=generation_model,
                        final_submission=submission,
                        account=account,
                    )

                    account = await _increment_failure_stats_and_release_account(
                        db=db,
                        account_service=account_service,
                        account_id=account.id,
                    )

                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='failed',
                        missing_provider_job=True,
                    )

                # Retry/no-job-id edge case: a newer submission may have
                # failed before getting a provider job id while an older
                # valid submission is still the actual in-flight job.
                # Poll the previous valid submission instead of calling
                # provider.check_status(None) and looping forever.
                if previous_valid_submission is not None:
                    latest_submission = submission
                    if latest_submission.status == "error":
                        latest_error_submission_without_job_id = latest_submission
                    submission = previous_valid_submission
                    if submission.account_id != account.id:
                        fallback_account = await db.get(ProviderAccount, submission.account_id)
                        if fallback_account:
                            account = fallback_account
                        else:
                            logger.error(
                                "account_not_found_previous_valid_submission",
                                generation_id=generation.id,
                                latest_submission_id=latest_submission.id,
                                polling_submission_id=submission.id,
                                account_id=submission.account_id,
                            )
                            await generation_service.mark_failed(
                                generation.id,
                                "Account not found for previous valid provider submission",
                            )
                            await db.commit()
                            return _PollGenerationResult(
                                generation_id=generation_id,
                                outcome='failed',
                                missing_provider_job=True,
                            )

                    logger.info(
                        "generation_poll_using_previous_valid_submission",
                        generation_id=generation.id,
                        latest_submission_id=latest_submission.id,
                        latest_submission_status=latest_submission.status,
                        polling_submission_id=submission.id,
                        polling_provider_job_id=submission.provider_job_id,
                        polling_submitted_at=(
                            str(submission.submitted_at) if submission.submitted_at else None
                        ),
                    )

            if (
                latest_error_submission_without_job_id is not None
                and generation.started_at
                and generation.started_at < mixed_submission_timeout_threshold
            ):
                logger.warning(
                    "generation_timeout_mixed_submissions",
                    generation_id=generation.id,
                    started_at=str(generation.started_at),
                    timeout_minutes=mixed_submission_timeout_minutes,
                    latest_submission_id=latest_error_submission_without_job_id.id,
                    latest_submission_status=latest_error_submission_without_job_id.status,
                    polling_submission_id=submission.id,
                    polling_provider_job_id=submission.provider_job_id,
                )
                return await _fail_with_timeout(
                    db,
                    generation_id=generation_id,
                    failure_reason=(
                        "Generation stuck after mixed provider submissions "
                        f"(timed out after {mixed_submission_timeout_minutes} minutes)"
                    ),
                    final_submission=latest_error_submission_without_job_id,
                    account=account,
                    generation_service=generation_service,
                    account_service=account_service,
                    missing_provider_job=missing_provider_job,
                )

            # Fail jobs that never got a provider_job_id after the short timeout
            # (submission to provider failed; no point polling for 2 hours)
            if (
                not submission.provider_job_id
                and generation.started_at
                and generation.started_at < unsubmitted_timeout_threshold
            ):
                logger.warning(
                    "generation_timeout_unsubmitted",
                    generation_id=generation.id,
                    started_at=str(generation.started_at),
                    timeout_minutes=unsubmitted_timeout_minutes,
                )
                return await _fail_with_timeout(
                    db,
                    generation_id=generation_id,
                    failure_reason=(
                        f"Generation failed: never submitted to provider (timed out after {unsubmitted_timeout_minutes} minutes)"
                    ),
                    final_submission=submission,
                    account=account,
                    generation_service=generation_service,
                    account_service=account_service,
                    missing_provider_job=missing_provider_job,
                )

            if generation.started_at and generation.started_at < timeout_threshold:
                recovered = await _attempt_last_ditch_recovery(
                    generation=generation,
                    submission=submission,
                    account=account,
                    operation_type=generation_operation_type,
                    poll_cache=poll_cache,
                )
                if not recovered:
                    logger.warning("generation_timeout", generation_id=generation.id, started_at=str(generation.started_at))
                    return await _fail_with_timeout(
                        db,
                        generation_id=generation_id,
                        failure_reason=f"Generation timed out after {timeout_hours} hours",
                        final_submission=submission,
                        account=account,
                        generation_service=generation_service,
                        account_service=account_service,
                        missing_provider_job=missing_provider_job,
                    )

            try:
                submission_model = await db.get(ProviderSubmission, submission.id)
                if submission_model is None:
                    logger.warning(
                        "generation_submission_missing_before_poll",
                        generation_id=generation_id,
                        submission_id=submission.id,
                    )
                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='still_processing',
                        missing_provider_job=missing_provider_job,
                    )

                transient_backoff_key = _transient_poll_key(
                    generation_id=generation.id,
                    submission_id=submission.id,
                    account_id=account.id,
                    provider_job_id=submission.provider_job_id,
                )
                _now_mono = time.monotonic()
                _adaptive_remaining = _get_adaptive_poll_defer_remaining(
                    transient_backoff_key, now_mono=_now_mono,
                )
                cooldown_remaining = max(
                    _get_transient_poll_backoff_remaining(transient_backoff_key, now_mono=_now_mono),
                    _get_non_transient_poll_backoff_remaining(transient_backoff_key, now_mono=_now_mono),
                    _adaptive_remaining,
                )
                if cooldown_remaining > 0:
                    logger.debug(
                        "provider_check_backoff_skip",
                        generation_id=generation.id,
                        submission_id=submission.id,
                        provider_job_id=submission.provider_job_id,
                        cooldown_remaining_s=round(cooldown_remaining, 2),
                        adaptive=round(_adaptive_remaining, 2),
                    )
                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='still_processing',
                        missing_provider_job=missing_provider_job,
                    )

                status_result = await provider_service.check_status(
                    submission=submission_model,
                    account=account,
                    operation_type=generation_operation_type,
                    poll_cache=poll_cache,
                )
                _clear_transient_poll_backoff(transient_backoff_key)
                submission = submission_model

                # Schedule the next adaptive defer.  Terminal statuses skip
                # this — the generation exits the processing snapshot on the
                # next tick and the key is pruned by
                # ``_prune_poll_backoff_dicts``.
                if status_result.status in (
                    ProviderStatus.PROCESSING,
                    ProviderStatus.FILTERED,
                ):
                    _adaptive_defer = _compute_adaptive_poll_defer_seconds(
                        provider_id=submission.provider_id,
                        operation_type=generation_operation_type,
                        generation_started_at=generation_started_at,
                        now=datetime.now(timezone.utc),
                    )
                    if _adaptive_defer > 0:
                        _record_adaptive_poll_defer(
                            transient_backoff_key,
                            _adaptive_defer,
                            now_mono=time.monotonic(),
                        )
                else:
                    _clear_adaptive_poll_defer(transient_backoff_key)

                # Include provider's raw status/metadata for debugging
                provider_status = None
                if status_result.metadata and isinstance(status_result.metadata, dict):
                    provider_status = status_result.metadata.get("provider_status")

                # Use info level so status is visible even when debug is filtered
                logger.info(
                    "generation_status",
                    generation_id=generation.id,
                    status=str(status_result.status),
                    progress=status_result.progress,
                    provider_status=str(provider_status) if provider_status is not None else None,
                )
                worker_debug.provider(
                    "generation_status",
                    generation_id=generation.id,
                    status=str(status_result.status),
                    progress=status_result.progress,
                    provider_status=str(provider_status) if provider_status is not None else None,
                )

                # Salvage check: a FILTERED pixverse video may still have a real
                # CDN file that lands a couple seconds after the placeholder
                # swap. If the preserved real URL serves 200, this flips
                # status_result to COMPLETED so the branch below creates the
                # asset (early-CDN-filtered); otherwise it stays FILTERED and is
                # finalized below as CONTENT_RENDER_MODERATED.
                if status_result.status == ProviderStatus.FILTERED:
                    await _maybe_salvage_filtered_pixverse_video(
                        db=db,
                        status_result=status_result,
                        submission=submission,
                        generation=generation,
                    )

                # Handle status
                if status_result.status == ProviderStatus.COMPLETED:
                    # If a cancel was requested while we polled, honour the
                    # completion anyway — the provider already generated the
                    # result and the user should receive it.  Clear the
                    # deferred action so downstream doesn't re-cancel.
                    generation_model = await db.get(Generation, generation.id)
                    if _has_pending_cancel(generation_model):
                        logger.info(
                            "generation_cancel_overridden_by_completion",
                            generation_id=generation.id,
                            deferred_action=generation_model.deferred_action,
                        )
                        generation_model.deferred_action = None
                        if generation_model.status == GenerationStatus.CANCELLED:
                            generation_model.status = GenerationStatus.PROCESSING
                        await db.commit()
                    elif generation_model is None:
                        logger.warning(
                            "generation_not_found_during_poll",
                            generation_id=generation.id,
                        )
                        account = await account_service.release_account(account.id)
                        await db.commit()
                        return _PollGenerationResult(
                            generation_id=generation_id,
                            outcome='failed',
                            missing_provider_job=missing_provider_job,
                        )

                    # Release account slot early — provider already freed its
                    # slot when the generation completed.  Holding ours during
                    # the asset download / billing / credit-refresh chain keeps
                    # the slot phantom-occupied and starves queued generations.
                    # Track stats first (needs the account row locked).
                    locked = await db.execute(
                        select(ProviderAccount).where(ProviderAccount.id == account.id).with_for_update()
                    )
                    account = locked.scalar_one()
                    account.total_videos_generated += 1
                    account.videos_today += 1
                    account.failure_streak = 0
                    account.last_used = datetime.now(timezone.utc)
                    if status_result.duration_sec:
                        account.update_ema_generation_time(status_result.duration_sec)
                    account.success_rate = account.calculate_success_rate()
                    await db.commit()

                    # Decrement account's concurrent job count and wake pinned waiters
                    account = await account_service.release_account(account.id)
                    await db.commit()

                    # --- Slot is now free for other generations ---

                    # Refresh submission to get updated response from check_status
                    await db.refresh(submission)
                    # Create asset from submission
                    asset = await asset_service.create_from_submission(
                        submission=submission,
                        generation=generation_model
                    )
                    logger.info("generation_completed", generation_id=generation.id, asset_id=asset.id)
                    worker_debug.worker(
                        "generation_completed",
                        generation_id=generation.id,
                        asset_id=asset.id,
                    )

                    # Inline prefetch: race the short-lived early-CDN window.
                    # Pixverse nukes the CDN object ~1-2 s after the URL is
                    # advertised for moderated content (confirmed via
                    # tests/manual_test_early_cdn.py), so by the time async
                    # ingestion picks up ASSET_CREATED via ARQ, the file may
                    # already 404.  We do one best-effort synchronous fetch
                    # here so the bytes land on disk while the URL is still
                    # live; if it fails we fall through to the normal async
                    # ingestion path, which has its own retry budget.
                    if submission.provider_id == "pixverse" and asset.remote_url:
                        try:
                            from pixsim7.backend.main.services.media.download import download_file
                            from pixsim7.backend.main.services.media.settings import get_media_settings
                            from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
                                is_pixverse_placeholder_url,
                            )
                            if is_pixverse_placeholder_url(asset.remote_url):
                                raise RuntimeError("remote_url is a pixverse placeholder; skipping prefetch")
                            await download_file(
                                asset,
                                get_media_settings(),
                                fast_single_attempt=True,
                            )
                            await db.commit()
                            logger.info(
                                "generation_prefetch_success",
                                generation_id=generation.id,
                                asset_id=asset.id,
                                stored_key=asset.stored_key,
                            )
                            worker_debug.worker(
                                "generation_prefetch_success",
                                generation_id=generation.id,
                                asset_id=asset.id,
                            )
                        except Exception as prefetch_err:
                            # 404 = CDN already nuked (moderation race lost);
                            # other = transient.  Either way async ingestion
                            # will retry with its normal retry budget.
                            logger.info(
                                "generation_prefetch_failed",
                                generation_id=generation.id,
                                asset_id=asset.id,
                                error=str(prefetch_err)[:200],
                                error_type=type(prefetch_err).__name__,
                            )
                            worker_debug.worker(
                                "generation_prefetch_failed",
                                generation_id=generation.id,
                                asset_id=asset.id,
                                error_type=type(prefetch_err).__name__,
                            )
                            await db.rollback()
                            # Re-fetch asset since rollback dropped our
                            # in-memory attribute changes.
                            asset = await db.get(Asset, asset.id)

                    # Note: early-CDN-filtered flag is stamped inside
                    # create_from_submission so it rides on the asset:created
                    # event. Publishing a follow-up asset:updated here raced
                    # the gallery's fetchCreatedAssetWhenReady retries (the
                    # update was silently dropped when the asset wasn't yet in
                    # the list — visible during 20-burst queues).
                    _is_early_cdn = is_early_cdn_terminal(status_result.metadata)
                    _is_filtered_completion = is_early_cdn_filtered(status_result.metadata)

                    # Schedule delayed moderation re-check (see
                    # _moderation_recheck_eligible). For early-CDN-terminal
                    # completions use a shorter first delay (15 s) — Pixverse
                    # issues the refund quickly.
                    _recheck_eligible = _moderation_recheck_eligible(
                        media_type=asset.media_type.value if asset.media_type else None,
                        is_early_cdn=_is_early_cdn,
                        has_provider_job_id=bool(submission.provider_job_id),
                    )
                    if _recheck_eligible:
                        _first_recheck_delay = _EARLY_CDN_RECHECK_DELAY_SEC if _is_early_cdn else _MODERATION_RECHECK_DELAYS_SEC[0]
                        _schedule_moderation_recheck(
                            asset_id=asset.id,
                            provider_job_id=submission.provider_job_id,
                            account_id=account.id,
                            generation_id=generation.id,
                            attempt=0,  # attempt index
                            operation_type=generation.operation_type,
                            provider_id=submission.provider_id,
                            delay_sec=_first_recheck_delay,
                        )

                    # Mark assets that completed despite a prior filtered attempt
                    if generation.attempt_id and generation.attempt_id > 1:
                        had_filtered = (await db.execute(
                            select(func.count()).select_from(ProviderSubmission).where(
                                ProviderSubmission.generation_id == generation.id,
                                ProviderSubmission.id != submission.id,
                                ProviderSubmission.response["status"].as_string() == "filtered",
                            )
                        )).scalar_one()
                        if had_filtered > 0:
                            meta = asset.media_metadata or {}
                            if not meta.get("moderation_retry"):
                                meta["moderation_retry"] = True
                                asset.media_metadata = meta
                                flag_modified(asset, "media_metadata")
                                await db.commit()
                                logger.info(
                                    "moderation_retry_tagged",
                                    asset_id=asset.id,
                                    generation_id=generation.id,
                                )

                    # Mark generation as completed
                    await generation_service.mark_completed(generation.id, asset.id)

                    # Filtered-retry cap: a clean completion proves this prompt
                    # CAN pass for this operation — reset its consecutive-fail
                    # streak so auto-retry is fully restored.
                    await clear_filtered_retry_count(
                        submission.provider_id,
                        getattr(generation_model.operation_type, "value", generation_model.operation_type),
                        seed_agnostic_prompt_group_hash(generation_model),
                    )

                    if _is_filtered_completion:
                        # Early CDN says filtered → Pixverse will auto-refund.
                        # Skip local billing deduction AND skip the credit refresh
                        # API call (which would likely return cached pre-refund
                        # values anyway).  The moderation recheck at 30 s will
                        # reconcile the real balance once the refund lands.
                        await db.refresh(generation_model)
                        generation_model.billing_state = BillingState.SKIPPED
                        generation_model.actual_credits = 0
                        generation_model.account_id = account.id
                        logger.info(
                            "billing_skipped_early_cdn_filtered",
                            generation_id=generation.id,
                            account_id=account.id,
                        )
                    else:
                        # Normal completion — charge credits and sync balance
                        await _finalize_generation_billing_best_effort(
                            db=db,
                            generation_id=generation.id,
                            generation_model=generation_model,
                            final_submission=submission,
                            account=account,
                            actual_duration=status_result.duration_sec,
                            refresh_generation=True,
                        )
                        await refresh_account_credits_best_effort(
                            account,
                            account_service,
                            logger,
                        )

                    await db.commit()

                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='completed',
                        missing_provider_job=missing_provider_job,
                    )

                elif status_result.status in {
                    ProviderStatus.FAILED,
                    ProviderStatus.FILTERED,
                    ProviderStatus.CANCELLED,
                }:
                    # Last-chance superseded-sibling salvage before
                    # finalizing terminal with no asset (asset 107327 /
                    # gen 134026 hole). See
                    # _maybe_recover_pixverse_image_sibling.
                    if await _maybe_recover_pixverse_image_sibling(
                        db,
                        generation_id=generation.id,
                        operation_type=generation_operation_type,
                        provider_id=generation.provider_id,
                        selected_submission_id=submission.id,
                    ):
                        return _PollGenerationResult(
                            generation_id=generation_id,
                            outcome='still_processing',
                            missing_provider_job=missing_provider_job,
                        )

                    # Re-check: generation may have a deferred cancel or
                    # been cancelled while we polled
                    generation_model = await db.get(Generation, generation.id)
                    if _has_pending_cancel(generation_model):
                        logger.info(
                            "generation_cancel_during_poll",
                            generation_id=generation.id,
                            deferred_action=generation_model.deferred_action,
                        )
                        generation_model.deferred_action = None
                        await db.commit()
                        account = await account_service.release_account(account.id)
                        if generation_model.status != GenerationStatus.CANCELLED:
                            await generation_service.update_status(
                                generation.id, GenerationStatus.CANCELLED,
                            )
                        return _PollGenerationResult(
                            generation_id=generation_id,
                            outcome='failed',
                            missing_provider_job=missing_provider_job,
                        )

                    # Mark this attempt as failed
                    logger.warning(
                        "generation_failed_provider",
                        generation_id=generation.id,
                        status=str(status_result.status),
                        error=status_result.error_message,
                    )
                    error_text = (
                        status_result.error_message
                        or f"Provider reported terminal status: {status_result.status.value}"
                    )
                    if status_result.status == ProviderStatus.FILTERED:
                        # Extend silent-stall: Pixverse accepts prompts their
                        # website rejects and stalls the job at status 5. Mark
                        # as prompt rejection (non-retryable) so auto-retry
                        # doesn't burn the budget re-submitting the same prompt.
                        if (status_result.metadata or {}).get("extend_silent_filter"):
                            error_code = GenerationErrorCode.CONTENT_PROMPT_REJECTED.value
                        elif _is_partner_interrupted_filter(status_result, generation):
                            # Fal-proxied models (grok-imagine, happyhorse-1.0)
                            # report video_status=8 when the partner accepts the
                            # job then refuses mid-stream. We can't tell whether
                            # prompt, image, or some other partner policy was
                            # the trigger — distinct, non-retryable code.
                            error_code = GenerationErrorCode.EXTERNAL_PARTNER_REFUSED.value
                        elif submission.provider_id == "pixverse":
                            # Reaching here means the salvage re-probe above did
                            # NOT recover a real video — the job was moderated at
                            # render time with no usable output. Retryable (some
                            # prompts do pass on a re-roll), but capped by the
                            # per-prompt circuit breaker below so a persistently-
                            # filtered prompt quarantines instead of churning.
                            # Scoped to pixverse (where we ran the salvage probe);
                            # other providers keep the retryable CONTENT_FILTERED.
                            error_code = GenerationErrorCode.CONTENT_RENDER_MODERATED.value
                        else:
                            error_code = GenerationErrorCode.CONTENT_FILTERED.value
                    elif status_result.status == ProviderStatus.FAILED:
                        error_code = GenerationErrorCode.PROVIDER_GENERIC.value
                    else:
                        error_code = None

                    # Filtered-retry cap: bump the consecutive-fail streak for
                    # this prompt+image, per operation. The auto-retry handler
                    # reads this streak and (when the operation has a configured
                    # cap) suppresses AUTO-retry once it crosses the cap (the job
                    # stays FAILED — still manually retryable, never paused). A
                    # success clears the streak (COMPLETED branch). Tracked for
                    # both filtered codes; whether a cap/backoff actually applies
                    # is decided per-operation by resolve_filtered_retry_policy.
                    if error_code in (
                        GenerationErrorCode.CONTENT_RENDER_MODERATED.value,
                        GenerationErrorCode.CONTENT_FILTERED.value,
                    ):
                        await bump_filtered_retry_count(
                            submission.provider_id,
                            getattr(generation_model.operation_type, "value", generation_model.operation_type),
                            seed_agnostic_prompt_group_hash(generation_model),
                            gen_logger=logger,
                        )

                    await generation_service.mark_failed(
                        generation.id,
                        error_text,
                        error_code=error_code,
                    )

                    # Finalize billing — reuse generation_model (avoids double fetch)
                    await _finalize_generation_billing_best_effort(
                        db=db,
                        generation_id=generation.id,
                        generation_model=generation_model,
                        final_submission=submission,
                        account=account,
                        refresh_generation=True,
                    )

                    # Track failure stats on account and release the slot.
                    account = await _increment_failure_stats_and_release_account(
                        db=db,
                        account_service=account_service,
                        account_id=account.id,
                    )

                    # Refresh credits from provider to sync actual balance
                    # (Pixverse auto-refunds for failed/filtered generations)
                    await refresh_account_credits_best_effort(
                        account,
                        account_service,
                        logger,
                    )
                    await db.commit()

                    # Poll-time terminal retries are owned by the
                    # job:failed event auto-retry handler. Do not also
                    # requeue here, or poller and event-handler race to
                    # retry the same generation.
                    logger.debug(
                        "auto_retry_delegated_to_event_handler",
                        generation_id=generation.id,
                        status=str(status_result.status),
                        error_code=error_code,
                    )

                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='failed',
                        missing_provider_job=missing_provider_job,
                    )

                elif status_result.status == ProviderStatus.PROCESSING:
                    return await _handle_processing_status(
                        db,
                        generation=generation,
                        account=account,
                        generation_service=generation_service,
                        account_service=account_service,
                        missing_provider_job=missing_provider_job,
                    )

                else:
                    logger.debug("generation_pending", generation_id=generation.id)
                    return _PollGenerationResult(
                        generation_id=generation_id,
                        outcome='still_processing',
                        missing_provider_job=missing_provider_job,
                    )

            except ProviderError as e:
                return await _handle_provider_check_error(
                    db,
                    e,
                    generation=generation,
                    submission=submission,
                    account=account,
                    generation_service=generation_service,
                    account_service=account_service,
                    transient_backoff_key=transient_backoff_key,
                    missing_provider_job=missing_provider_job,
                )

        except Exception as e:
            if _is_transient_network_error(e):
                # `generation_id` was captured from the frozen snapshot at
                # function entry; prefer it over `generation.id` so we do not
                # touch ORM attributes inside an error handler.
                failure_count, delay_sec = _record_transient_poll_backoff(
                    transient_backoff_key or str(generation_id),
                    now_mono=time.monotonic(),
                )
                # Read submission attributes from __dict__ to avoid triggering
                # a lazy reload on an expired ORM instance (MissingGreenlet).
                _sub = submission if "submission" in locals() and submission else None
                submission_id = _sub.__dict__.get("id") if _sub is not None else None
                provider_job_id = (
                    _sub.__dict__.get("provider_job_id") if _sub is not None else None
                )
                logger.warning(
                    "poll_generation_transient_error",
                    generation_id=generation_id,
                    submission_id=submission_id,
                    provider_job_id=provider_job_id,
                    error=str(e),
                    error_type=e.__class__.__name__,
                    transient_failures=failure_count,
                    backoff_s=delay_sec,
                )
                return _PollGenerationResult(
                    generation_id=generation_id,
                    outcome='still_processing',
                    missing_provider_job=missing_provider_job,
                )
            logger.error("poll_generation_error", generation_id=generation_id, error=str(e), exc_info=True)
            worker_debug.worker(
                "poll_generation_error",
                generation_id=generation_id,
                error=str(e),
            )
            return _PollGenerationResult(generation_id=generation_id, outcome='error')


@dataclass
class _GenerationPhaseStats:
    checked: int = 0
    completed: int = 0
    failed: int = 0
    still_processing: int = 0
    still_processing_ids: list[int] = field(default_factory=list)
    missing_provider_job_ids: list[int] = field(default_factory=list)


@dataclass
class _AnalysisPhaseStats:
    checked: int = 0
    completed: int = 0
    failed: int = 0
    still_processing: int = 0


async def _poll_generations_phase(
    db: AsyncSession,
    *,
    poll_status_cache: dict[str, object],
    worker_debug: Any,
) -> _GenerationPhaseStats:
    """Load PROCESSING generations and fan out to ``_poll_single_generation``."""
    stats = _GenerationPhaseStats()

    processing_generations = await _load_processing_generation_snapshots(db)
    logger.info("poll_loaded", count=len(processing_generations))

    # Release the read transaction the SELECT above opened on the shared
    # connection BEFORE the concurrent HTTP fan-out below. The fan-out polls
    # each generation in its own session (``_poll_single_generation``) and can
    # run for many seconds; if we kept this transaction open the shared
    # connection would sit "idle in transaction" for that whole window and
    # Postgres' ``idle_in_transaction_session_timeout`` (30s) would terminate
    # it — poisoning the session so the later moderation/analysis phases and
    # the final commit fail with InterfaceError, taking the whole poll cron
    # down. Snapshots are plain dataclasses, so dropping the txn is safe.
    await db.rollback()

    if not processing_generations:
        return stats

    logger.info("poll_found_generations", count=len(processing_generations))
    worker_debug.worker("poll_found_generations", count=len(processing_generations))
    snapshot = _processing_generations_snapshot(processing_generations)
    if snapshot["count"] >= 5 or snapshot["oldest_started_age_seconds"] >= 60:
        logger.warning("poll_processing_snapshot", **snapshot)
    else:
        logger.info("poll_processing_snapshot", **snapshot)

    # Timeout threshold (processing > 2 hours = stuck)
    TIMEOUT_HOURS = 2
    timeout_threshold = datetime.now(timezone.utc) - timedelta(hours=TIMEOUT_HOURS)
    # Shorter timeout for jobs that never got a provider_job_id
    # (submission to provider failed, no point waiting 2 hours)
    UNSUBMITTED_TIMEOUT_MINUTES = 15
    unsubmitted_timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=UNSUBMITTED_TIMEOUT_MINUTES)
    # Mixed-submission recovery: latest submit failed without a job id
    # while an older valid provider job exists. These can stay stuck in
    # PROCESSING if provider status polling never resolves the older job.
    MIXED_SUBMISSION_TIMEOUT_MINUTES = 20
    mixed_submission_timeout_threshold = datetime.now(timezone.utc) - timedelta(
        minutes=MIXED_SUBMISSION_TIMEOUT_MINUTES
    )

    now_mono = time.monotonic()
    active_backoffs = _active_transient_poll_backoffs(now_mono=now_mono)
    max_concurrent_polls = _POLL_CONCURRENCY_NORMAL
    if active_backoffs >= _POLL_CONCURRENCY_DEGRADE_THRESHOLD:
        max_concurrent_polls = _POLL_CONCURRENCY_DEGRADED
        logger.warning(
            "poll_concurrency_reduced_due_to_transient_network",
            active_transient_backoffs=active_backoffs,
            max_concurrent_polls=max_concurrent_polls,
        )
    poll_semaphore = asyncio.Semaphore(max_concurrent_polls)

    async def _bounded_poll(gen):
        if gen.id in _poll_in_flight:
            return None  # Already being polled by an overlapping cycle
        _poll_in_flight.add(gen.id)
        try:
            async with poll_semaphore:
                return await _poll_single_generation(
                    gen, poll_status_cache,
                    timeout_threshold, unsubmitted_timeout_threshold,
                    mixed_submission_timeout_threshold,
                    TIMEOUT_HOURS, UNSUBMITTED_TIMEOUT_MINUTES,
                    MIXED_SUBMISSION_TIMEOUT_MINUTES,
                )
        finally:
            _poll_in_flight.discard(gen.id)

    poll_results = await asyncio.gather(
        *[_bounded_poll(gen) for gen in processing_generations],
        return_exceptions=True,
    )

    for poll_result in poll_results:
        if poll_result is None:
            continue  # Skipped (in-flight guard)
        if isinstance(poll_result, Exception):
            logger.error("poll_gather_error", error=str(poll_result), exc_info=True)
            continue
        stats.checked += 1
        if poll_result.outcome == 'completed':
            stats.completed += 1
        elif poll_result.outcome == 'failed':
            stats.failed += 1
        elif poll_result.outcome == 'still_processing':
            stats.still_processing += 1
            stats.still_processing_ids.append(poll_result.generation_id)
        if poll_result.missing_provider_job:
            stats.missing_provider_job_ids.append(poll_result.generation_id)

    return stats


async def _run_moderation_rechecks_phase(
    db: AsyncSession,
    *,
    account_service: AccountService,
) -> None:
    """Re-check recently completed media at staggered intervals to detect
    post-delivery flagging (all videos; early-CDN-salvaged images)."""
    now_mono = time.monotonic()
    due_rechecks = [
        (asset_id, info) for asset_id, info in _moderation_recheck.items()
        if now_mono >= info[2]
    ]
    for asset_id, (provider_job_id, account_id, _, gen_id, attempt, op_type, recheck_provider_id) in due_rechecks:
        _moderation_recheck.pop(asset_id, None)
        try:
            asset = await db.get(Asset, asset_id)
            asset_remote_url = asset.remote_url if asset else None

            recheck_account = await db.get(ProviderAccount, account_id)
            if not recheck_account:
                continue

            # Fast path: asset was already flagged at completion time
            # (e.g. early-CDN terminal with original_status=filtered).
            # The CDN may still be serving briefly, so the probe would
            # return "ok" and skip the credit refresh.  Skip the
            # moderation verification and go straight to credit refresh
            # so the Pixverse refund lands in our DB.
            already_flagged = bool(
                asset and (asset.media_metadata or {}).get("provider_flagged")
            )
            if already_flagged:
                await refresh_account_credits_best_effort(
                    recheck_account,
                    account_service,
                    logger,
                    db=db,
                    success_log_event="moderation_recheck_credits_refreshed_known_flagged",
                    success_log_fields={
                        "account_id": recheck_account.id,
                        "asset_id": asset_id,
                        "attempt": attempt,
                    },
                    failure_log_event="moderation_recheck_credit_refresh_failed",
                    failure_log_fields={"account_id": recheck_account.id},
                )
                # Schedule one follow-up in case Pixverse's refund
                # hadn't landed by the first refresh.  Only after the
                # first attempt so we don't loop forever.
                if attempt == 0:
                    _schedule_moderation_recheck(
                        asset_id=asset_id,
                        provider_job_id=provider_job_id,
                        account_id=account_id,
                        generation_id=gen_id,
                        attempt=1,
                        operation_type=op_type,
                        provider_id=recheck_provider_id,
                        delay_sec=_KNOWN_FLAGGED_FOLLOWUP_DELAY_SEC,
                    )
                continue

            recheck_provider = _provider_registry.get(recheck_provider_id)
            recheck_result = await recheck_provider.moderation_recheck(
                account=recheck_account,
                provider_job_id=provider_job_id,
                asset_remote_url=asset_remote_url,
                operation_type=op_type,
            )

            if recheck_result.is_flagged and asset:
                meta = asset.media_metadata or {}
                if not meta.get("provider_flagged"):
                    meta["provider_flagged"] = True
                    meta["provider_flagged_reason"] = "post_delivery_moderation"
                    asset.media_metadata = meta
                    flag_modified(asset, "media_metadata")
                    await db.commit()
                    logger.info(
                        "moderation_recheck_flagged",
                        asset_id=asset_id,
                        generation_id=gen_id,
                        provider_job_id=provider_job_id,
                        attempt=attempt,
                    )
                    await event_bus.publish(ASSET_UPDATED, {
                        "asset_id": asset_id,
                        "user_id": asset.user_id,
                        "reason": "moderation_flagged",
                    })
                if recheck_result.should_refresh_credits:
                    await refresh_account_credits_best_effort(
                        recheck_account,
                        account_service,
                        logger,
                        db=db,
                        success_log_event="moderation_recheck_credits_refreshed",
                        success_log_fields={
                            "account_id": recheck_account.id,
                            "asset_id": asset_id,
                        },
                        failure_log_event="moderation_recheck_credit_refresh_failed",
                        failure_log_fields={"account_id": recheck_account.id},
                    )
            elif not recheck_result.is_flagged:
                # Not flagged (ok or inconclusive) — schedule next attempt.
                next_attempt = attempt + 1
                if next_attempt < _MODERATION_RECHECK_MAX_ATTEMPTS:
                    delay = _MODERATION_RECHECK_DELAYS_SEC[next_attempt]
                    _schedule_moderation_recheck(
                        asset_id=asset_id,
                        provider_job_id=provider_job_id,
                        account_id=account_id,
                        generation_id=gen_id,
                        attempt=next_attempt,
                        operation_type=op_type,
                        provider_id=recheck_provider_id,
                        delay_sec=delay,
                    )
                    logger.debug(
                        "moderation_recheck_retry_scheduled",
                            asset_id=asset_id,
                            attempt=next_attempt,
                            delay_sec=delay,
                        )

            # Bound the shared connection's transaction to a single recheck so
            # it isn't left "idle in transaction" across every item's provider
            # HTTP call (Postgres' 30s idle-in-transaction timeout would
            # otherwise terminate it mid-cron). No-op when the branch above
            # already committed.
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning(
                "moderation_recheck_error",
                asset_id=asset_id,
                attempt=attempt,
                error=str(e),
            )


async def _poll_analyses_phase(
    db: AsyncSession,
    *,
    provider_service: ProviderService,
    worker_debug: Any,
) -> _AnalysisPhaseStats:
    """Poll PROCESSING analyses and apply terminal / timeout transitions."""
    stats = _AnalysisPhaseStats()

    analysis_service = AnalysisService(db)

    result = await db.execute(
        select(AssetAnalysis)
        .where(AssetAnalysis.status == AnalysisStatus.PROCESSING)
        .order_by(AssetAnalysis.started_at)
    )
    processing_analyses = list(result.scalars().all())

    if processing_analyses:
        logger.info("poll_found_analyses", count=len(processing_analyses))
        worker_debug.worker("poll_found_analyses", count=len(processing_analyses))

    for analysis in processing_analyses:
        stats.checked += 1
        # Capture the id up-front so the error handler at the bottom of the
        # loop can log it without touching a potentially-expired ORM instance.
        _analysis_id = analysis.__dict__.get("id")

        try:
            # Get latest submission for this analysis
            submission_result = await db.execute(
                select(ProviderSubmission)
                .where(ProviderSubmission.analysis_id == analysis.id)
                .order_by(ProviderSubmission.submitted_at.desc())
                .limit(1)
            )
            submission = submission_result.scalars().first()

            if not submission:
                logger.warning("no_analysis_submission", analysis_id=analysis.id)
                await analysis_service.mark_failed(
                    analysis.id,
                    "No provider submission found"
                )
                stats.failed += 1
                continue

            account = await db.get(ProviderAccount, submission.account_id)
            if not account:
                logger.error("analysis_account_not_found", account_id=submission.account_id)
                await analysis_service.mark_failed(analysis.id, "Account not found")
                stats.failed += 1
                continue

            # Check timeout (analyses > 30 min = stuck)
            ANALYSIS_TIMEOUT_MINUTES = 30
            analysis_timeout_threshold = datetime.now(timezone.utc) - timedelta(minutes=ANALYSIS_TIMEOUT_MINUTES)

            if analysis.started_at and analysis.started_at < analysis_timeout_threshold:
                logger.warning("analysis_timeout", analysis_id=analysis.id, started_at=str(analysis.started_at))
                await analysis_service.mark_failed(
                    analysis.id,
                    f"Analysis timed out after {ANALYSIS_TIMEOUT_MINUTES} minutes"
                )

                # Decrement account's concurrent job count
                if account.current_processing_jobs > 0:
                    account.current_processing_jobs -= 1

                stats.failed += 1
                continue

            try:
                status_result = await provider_service.check_analysis_status(
                    submission=submission,
                    account=account,
                )

                logger.debug(
                    "analysis_status",
                    analysis_id=analysis.id,
                    status=str(status_result.status),
                    progress=status_result.progress
                )

                # Handle status
                if status_result.status == ProviderStatus.COMPLETED:
                    # Extract result from submission response
                    await db.refresh(submission)
                    result_data = submission.response.get("result", {})

                    await analysis_service.mark_completed(analysis.id, result_data)
                    logger.info("analysis_completed", analysis_id=analysis.id)

                    # Decrement account's concurrent job count
                    if account.current_processing_jobs > 0:
                        account.current_processing_jobs -= 1

                    stats.completed += 1

                elif status_result.status in {
                    ProviderStatus.FAILED,
                    ProviderStatus.FILTERED,
                    ProviderStatus.CANCELLED,
                }:
                    logger.warning(
                        "analysis_failed_provider",
                        analysis_id=analysis.id,
                        status=str(status_result.status),
                        error=status_result.error_message,
                    )
                    await analysis_service.mark_failed(
                        analysis.id,
                        status_result.error_message
                        or f"Provider reported terminal status: {status_result.status.value}",
                    )

                    # Decrement account's concurrent job count
                    if account.current_processing_jobs > 0:
                        account.current_processing_jobs -= 1

                    stats.failed += 1

                elif status_result.status == ProviderStatus.PROCESSING:
                    stats.still_processing += 1

                else:
                    logger.debug("analysis_pending", analysis_id=analysis.id)
                    stats.still_processing += 1

            except ProviderError as e:
                _apoll_log = logger.warning if getattr(e, 'error_code', None) else logger.error
                _apoll_log("provider_analysis_check_error", analysis_id=_analysis_id, error=str(e))
                stats.still_processing += 1

            # Commit per analysis so the shared connection isn't left "idle in
            # transaction" accumulating across every item's HTTP call — that
            # would trip Postgres' 30s idle-in-transaction timeout on a busy
            # batch and kill the whole poll cron. Also isolates each analysis:
            # one failure no longer rolls back the others.
            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error("poll_analysis_error", analysis_id=_analysis_id, error=str(e), exc_info=True)
            worker_debug.worker(
                "poll_analysis_error",
                analysis_id=_analysis_id,
                error=str(e),
            )

    return stats


async def poll_job_statuses(ctx: dict) -> dict:
    """
    Poll status of all processing generations.

    Runs periodically (e.g. every 10 seconds). Three phases per cycle:
      1. Poll PROCESSING generations.
      2. Run due moderation re-checks (post-delivery flagging).
      3. Poll PROCESSING analyses.
    """
    _init_poller_debug_flags()
    now_mono = time.monotonic()
    _prune_transient_poll_backoff(now_mono=now_mono)
    worker_debug = get_global_debug_logger()
    worker_debug.worker("poll_start")

    poll_status_cache: dict[str, object] = {}

    async for db in get_db():
        try:
            provider_service = ProviderService(db)
            account_service = AccountService(db)

            gen_stats = await _poll_generations_phase(
                db,
                poll_status_cache=poll_status_cache,
                worker_debug=worker_debug,
            )

            await _run_moderation_rechecks_phase(
                db,
                account_service=account_service,
            )

            analysis_stats = await _poll_analyses_phase(
                db,
                provider_service=provider_service,
                worker_debug=worker_debug,
            )

            await db.commit()

            stats = {
                "checked": gen_stats.checked,
                "completed": gen_stats.completed,
                "failed": gen_stats.failed,
                "still_processing": gen_stats.still_processing,
                "analyses_checked": analysis_stats.checked,
                "analyses_completed": analysis_stats.completed,
                "analyses_failed": analysis_stats.failed,
                "analyses_still_processing": analysis_stats.still_processing,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            total_checked = gen_stats.checked + analysis_stats.checked
            if total_checked > 0:
                logger.info(
                    "poll_complete",
                    generations_checked=gen_stats.checked,
                    generations_completed=gen_stats.completed,
                    generations_failed=gen_stats.failed,
                    generations_still_processing=gen_stats.still_processing,
                    still_processing_ids_sample=gen_stats.still_processing_ids[:10] if gen_stats.still_processing_ids else None,
                    missing_provider_job_ids_sample=(
                        gen_stats.missing_provider_job_ids[:10]
                        if gen_stats.missing_provider_job_ids
                        else None
                    ),
                    analyses_checked=analysis_stats.checked,
                    analyses_completed=analysis_stats.completed,
                    analyses_failed=analysis_stats.failed,
                    analyses_still_processing=analysis_stats.still_processing,
                )
                worker_debug.worker("poll_complete", **stats)
            else:
                logger.debug("poll_complete_idle", msg="No jobs to process")

            return stats

        except Exception as e:
            logger.error("poll_error", error=str(e), exc_info=True)
            worker_debug.worker("poll_error", error=str(e))
            raise

        finally:
            await db.close()


async def poll_generation_once(ctx: dict, generation_id: int) -> dict:
    """One-shot poll for a freshly-submitted generation.

    Enqueued by ``job_processor`` right after a successful provider submit so
    we can catch very short-lived CDN URLs (e.g. Pixverse moderated content,
    where the real URL stays up for only ~1-2 s) before the 2 s cron tick
    would otherwise race past.

    Uses the same ``_poll_in_flight`` guard as the cron path, so an overlap
    between this one-shot and a cron tick won't double-process the generation.
    """
    _init_poller_debug_flags()
    worker_debug = get_global_debug_logger()
    worker_debug.worker("poll_generation_once_start", generation_id=generation_id)

    async with get_async_session() as db:
        snapshot = await _load_processing_generation_snapshot(db, generation_id)

    if snapshot is None:
        logger.info(
            "poll_generation_once_skipped_not_processing",
            generation_id=generation_id,
        )
        return {"polled": False, "reason": "not_processing"}

    if snapshot.id in _poll_in_flight:
        logger.info(
            "poll_generation_once_skipped_in_flight",
            generation_id=generation_id,
        )
        return {"polled": False, "reason": "in_flight"}

    now = datetime.now(timezone.utc)
    timeout_hours = 2
    unsubmitted_timeout_minutes = 15
    mixed_submission_timeout_minutes = 20
    timeout_threshold = now - timedelta(hours=timeout_hours)
    unsubmitted_timeout_threshold = now - timedelta(minutes=unsubmitted_timeout_minutes)
    mixed_submission_timeout_threshold = now - timedelta(minutes=mixed_submission_timeout_minutes)

    _poll_in_flight.add(snapshot.id)
    try:
        poll_cache: dict[str, object] = {}
        result = await _poll_single_generation(
            snapshot,
            poll_cache,
            timeout_threshold,
            unsubmitted_timeout_threshold,
            mixed_submission_timeout_threshold,
            timeout_hours,
            unsubmitted_timeout_minutes,
            mixed_submission_timeout_minutes,
        )
    finally:
        _poll_in_flight.discard(snapshot.id)

    outcome = getattr(result, "outcome", None)
    logger.info(
        "poll_generation_once_done",
        generation_id=generation_id,
        outcome=outcome,
    )
    worker_debug.worker(
        "poll_generation_once_done",
        generation_id=generation_id,
        outcome=outcome,
    )
    return {"polled": True, "outcome": outcome}


_event_bridge = None


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    global _event_bridge
    logger.info("status_poller_started")
    _event_bridge = await start_event_bus_bridge(role="status_poller")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    global _event_bridge
    logger.info("status_poller_shutdown")
    if _event_bridge:
        await stop_event_bus_bridge()
        _event_bridge = None


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for status poller"""
    functions = [poll_job_statuses]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = settings.redis_url

    # Run poll_job_statuses every 10 seconds
    cron_jobs = [
        {
            "function": poll_job_statuses,
            "cron": "*/10 * * * * *",  # Every 10 seconds
        }
    ]
