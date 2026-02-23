"""
Generation job queue helpers.

Separates fresh generation submissions from deferred/retry generation jobs so
fresh user work can start ahead of retry churn.
"""
from __future__ import annotations

import logging
import os
import random
import json
from typing import TypedDict
from datetime import timedelta
from datetime import datetime
from datetime import timezone

# ARQ default queue name for fresh jobs.
GENERATION_FRESH_QUEUE_NAME = "arq:queue"

# Dedicated queue for generation retries/deferred work.
GENERATION_RETRY_QUEUE_NAME = "arq:queue:generation-retry"
GENERATION_ENQUEUE_LEASE_KEY_PREFIX = "pixsim7:generation:enqueue_lease"
GENERATION_WAIT_META_KEY_PREFIX = "pixsim7:generation:wait_meta"

logger = logging.getLogger(__name__)


class GenerationRetryEnqueueResult(TypedDict):
    enqueued: bool
    deduped: bool
    actual_defer_seconds: int | None


def _get_retry_defer_jitter_seconds() -> int:
    """Optional one-sided defer jitter to avoid synchronized wakeups."""
    raw = os.getenv("GENERATION_RETRY_DEFER_JITTER_SECONDS", "7").strip()
    try:
        return max(0, int(raw))
    except ValueError:
        return 7


def _get_generation_enqueue_lease_base_ttl_seconds() -> int:
    raw = os.getenv("GENERATION_ENQUEUE_LEASE_TTL_SECONDS", "300").strip()
    try:
        return max(30, int(raw))
    except ValueError:
        return 300


def _generation_enqueue_lease_key(generation_id: int) -> str:
    return f"{GENERATION_ENQUEUE_LEASE_KEY_PREFIX}:{generation_id}"


def _generation_wait_meta_key(generation_id: int) -> str:
    return f"{GENERATION_WAIT_META_KEY_PREFIX}:{generation_id}"


def _compute_generation_enqueue_lease_ttl_seconds(*, defer_seconds: int | None = None) -> int:
    base_ttl = _get_generation_enqueue_lease_base_ttl_seconds()
    if not defer_seconds or defer_seconds <= 0:
        return base_ttl
    # Cover deferred wait + startup lag before process_generation clears the lease.
    return max(base_ttl, defer_seconds + 120)


async def acquire_generation_enqueue_lease(
    arq_pool,
    generation_id: int,
    *,
    defer_seconds: int | None = None,
) -> bool:
    """Acquire best-effort single-flight enqueue lease for a generation."""
    key = _generation_enqueue_lease_key(generation_id)
    ttl_seconds = _compute_generation_enqueue_lease_ttl_seconds(defer_seconds=defer_seconds)
    try:
        acquired = await arq_pool.set(key, "1", ex=ttl_seconds, nx=True)
        # aioredis may return bool or bytes-ish; normalize truthy only.
        return bool(acquired)
    except Exception:
        # Fail open: if Redis lease fails, do not block enqueueing.
        logger.debug(
            "generation_enqueue_lease_acquire_failed",
            extra={"generation_id": generation_id},
            exc_info=True,
        )
        return True


async def release_generation_enqueue_lease(arq_pool, generation_id: int) -> None:
    """Release the enqueue lease when a worker starts consuming the generation."""
    key = _generation_enqueue_lease_key(generation_id)
    try:
        await arq_pool.delete(key)
    except Exception:
        logger.debug(
            "generation_enqueue_lease_release_failed",
            extra={"generation_id": generation_id},
            exc_info=True,
        )


def _get_generation_wait_meta_ttl_seconds() -> int:
    raw = os.getenv("GENERATION_WAIT_META_TTL_SECONDS", "86400").strip()
    try:
        return max(300, int(raw))
    except ValueError:
        return 86400


async def set_generation_wait_metadata(
    arq_pool,
    generation_id: int,
    *,
    reason: str,
    account_id: int | None = None,
    next_attempt_at: datetime | None = None,
    source: str | None = None,
) -> None:
    """Persist explicit wait metadata for dispatcher/admission visibility."""
    key = _generation_wait_meta_key(generation_id)
    payload: dict[str, object] = {
        "reason": reason,
        "set_at": datetime.now(timezone.utc).isoformat(),
    }
    if account_id is not None:
        payload["account_id"] = int(account_id)
    if next_attempt_at is not None:
        payload["next_attempt_at"] = next_attempt_at.isoformat()
    if source:
        payload["source"] = source
    try:
        await arq_pool.set(
            key,
            json.dumps(payload, separators=(",", ":")),
            ex=_get_generation_wait_meta_ttl_seconds(),
        )
    except Exception:
        logger.debug(
            "generation_wait_meta_set_failed",
            extra={"generation_id": generation_id, "reason": reason},
            exc_info=True,
        )


async def get_generation_wait_metadata(arq_pool, generation_id: int) -> dict[str, object] | None:
    """Load explicit wait metadata if present."""
    key = _generation_wait_meta_key(generation_id)
    try:
        raw = await arq_pool.get(key)
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        payload = json.loads(raw)
        return payload if isinstance(payload, dict) else None
    except Exception:
        logger.debug(
            "generation_wait_meta_get_failed",
            extra={"generation_id": generation_id},
            exc_info=True,
        )
        return None


async def clear_generation_wait_metadata(arq_pool, generation_id: int) -> None:
    """Clear explicit wait metadata after dispatcher/worker admission."""
    key = _generation_wait_meta_key(generation_id)
    try:
        await arq_pool.delete(key)
    except Exception:
        logger.debug(
            "generation_wait_meta_clear_failed",
            extra={"generation_id": generation_id},
            exc_info=True,
        )


async def enqueue_generation_fresh_job(arq_pool, generation_id: int) -> bool:
    """Enqueue a generation on the default (fresh) queue."""
    if not await acquire_generation_enqueue_lease(arq_pool, generation_id):
        logger.info(
            "generation_enqueue_deduped",
            extra={
                "generation_id": generation_id,
                "target_queue": GENERATION_FRESH_QUEUE_NAME,
                "defer_seconds": None,
            },
        )
        return False
    await arq_pool.enqueue_job(
        "process_generation",
        generation_id=generation_id,
    )
    return True


async def enqueue_generation_retry_job(
    arq_pool,
    generation_id: int,
    *,
    defer_seconds: int | None = None,
) -> GenerationRetryEnqueueResult:
    """Enqueue a generation on the retry queue, optionally deferred.

    Returns enqueue outcome plus actual defer seconds (after jitter) when
    applicable. Callers should inspect ``enqueued`` to distinguish a real
    enqueue from a dedupe lease hit.
    """
    kwargs: dict[str, object] = {
        "generation_id": generation_id,
        "_queue_name": GENERATION_RETRY_QUEUE_NAME,
    }
    actual_defer_seconds: int | None = None
    if defer_seconds and defer_seconds > 0:
        jitter = _get_retry_defer_jitter_seconds()
        actual_defer_seconds = defer_seconds + (
            random.randint(0, jitter) if jitter > 0 else 0
        )
        kwargs["_defer_by"] = timedelta(seconds=actual_defer_seconds)

    lease_defer_seconds = actual_defer_seconds if actual_defer_seconds is not None else defer_seconds
    if not await acquire_generation_enqueue_lease(
        arq_pool,
        generation_id,
        defer_seconds=lease_defer_seconds,
    ):
        logger.info(
            "generation_enqueue_deduped",
            extra={
                "generation_id": generation_id,
                "target_queue": GENERATION_RETRY_QUEUE_NAME,
                "defer_seconds": lease_defer_seconds,
            },
        )
        return {
            "enqueued": False,
            "deduped": True,
            "actual_defer_seconds": actual_defer_seconds,
        }

    await arq_pool.enqueue_job("process_generation", **kwargs)
    return {
        "enqueued": True,
        "deduped": False,
        "actual_defer_seconds": actual_defer_seconds,
    }
