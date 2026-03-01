"""
Adaptive provider concurrency management.

Learns per-account/operation/model effective concurrency caps by tracking
provider concurrent-limit rejections and probe successes.  Used by
process_generation to gate submissions and schedule probes.

Also contains pinned-generation sibling counting and concurrent-defer planning.
"""
import random
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.shared.config import settings


# ---------------------------------------------------------------------------
# Constants (authoritative copies — re-exported to job_processor)
# ---------------------------------------------------------------------------

# Cooldown applied when an account hits its concurrent job limit.
CONCURRENT_COOLDOWN_SECONDS = 30

# Max times a pinned-account generation will be deferred waiting for a
# concurrent slot before giving up.
MAX_PINNED_CONCURRENT_RETRIES = 12

# After this fraction of MAX_PINNED_CONCURRENT_RETRIES, a generation will
# check for siblings (other pending generations targeting the same account)
# and yield by using a longer defer if any exist.
PINNED_YIELD_THRESHOLD_RATIO = 0.5
PINNED_YIELD_DEFER_MULTIPLIER = 3


# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------

def _settings_int(name: str, default: int, minimum: int | None = None) -> int:
    try:
        value = int(getattr(settings, name, default))
    except Exception:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    return value


def _settings_float(name: str, default: float, minimum: float | None = None) -> float:
    try:
        value = float(getattr(settings, name, default))
    except Exception:
        value = default
    if minimum is not None:
        value = max(minimum, value)
    return value


def _settings_bool(name: str, default: bool) -> bool:
    try:
        value = getattr(settings, name, default)
    except Exception:
        return default
    return bool(value)


def _pinned_wait_padding_seconds() -> int:
    return _settings_int("pinned_wait_padding_seconds", 1, minimum=0)


def _pixverse_concurrent_cooldown_seconds() -> int:
    return _settings_int("pixverse_concurrent_cooldown_seconds", 6, minimum=1)


def _pixverse_i2i_concurrent_cooldown_seconds() -> int:
    return _settings_int("pixverse_i2i_concurrent_cooldown_seconds", 2, minimum=1)


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

def _get_operation_value(generation: Generation) -> str | None:
    """Extract operation_type string from a generation."""
    op = getattr(generation, "operation_type", None)
    if op is None:
        return None
    return op.value if hasattr(op, "value") else str(op)


def _get_concurrent_limit_cooldown_seconds(
    generation: Generation,
    account: ProviderAccount,
) -> int:
    """Return provider/operation-specific cooldown after concurrent-limit submit failures."""
    provider_id = str(getattr(account, "provider_id", "") or "").lower()
    operation_type = (_get_operation_value(generation) or "").lower()

    if provider_id == "pixverse" and operation_type == "image_to_image":
        return _pixverse_i2i_concurrent_cooldown_seconds()
    if provider_id == "pixverse":
        return _pixverse_concurrent_cooldown_seconds()

    return CONCURRENT_COOLDOWN_SECONDS


# ---------------------------------------------------------------------------
# Adaptive concurrency settings
# ---------------------------------------------------------------------------

def _adaptive_provider_concurrency_enabled_setting() -> bool:
    return _settings_bool("adaptive_provider_concurrency_enabled", True)


def _adaptive_provider_concurrency_enabled() -> bool:
    return _adaptive_provider_concurrency_enabled_setting()


def _adaptive_provider_concurrency_state_ttl_seconds() -> int:
    return _settings_int("adaptive_provider_concurrency_state_ttl_seconds", 21600, minimum=60)


def _adaptive_provider_concurrency_probe_min_seconds() -> int:
    return _settings_int("adaptive_provider_concurrency_probe_min_seconds", 120, minimum=30)


def _adaptive_provider_concurrency_probe_max_seconds() -> int:
    return _settings_int("adaptive_provider_concurrency_probe_max_seconds", 180, minimum=30)


def _adaptive_provider_concurrency_probe_lock_ttl_seconds() -> int:
    return _settings_int("adaptive_provider_concurrency_probe_lock_ttl_seconds", 300, minimum=30)


def _adaptive_provider_concurrency_defer_jitter_max_seconds() -> int:
    return _settings_int("adaptive_provider_concurrency_defer_jitter_max_seconds", 6, minimum=0)


def _adaptive_provider_concurrency_lower_after_consecutive_rejects() -> int:
    return _settings_int("adaptive_provider_concurrency_lower_after_consecutive_rejects", 10, minimum=1)


def _adaptive_provider_concurrency_raise_after_consecutive_probe_successes() -> int:
    return _settings_int(
        "adaptive_provider_concurrency_raise_after_consecutive_probe_successes",
        2,
        minimum=1,
    )


def _max_pinned_concurrent_waits() -> int:
    return _settings_int("max_pinned_concurrent_waits", MAX_PINNED_CONCURRENT_RETRIES * 6, minimum=1)


def _pinned_concurrent_wait_counter_ttl_seconds() -> int:
    return _settings_int("pinned_concurrent_wait_counter_ttl_seconds", 172800, minimum=60)


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _normalize_positive_int(value: Any, default: int) -> int:
    try:
        n = int(value)
    except Exception:
        return default
    return n if n > 0 else default


def _clamp_provider_cap(value: int, configured_cap: int) -> int:
    return max(1, min(int(value), int(configured_cap)))


def _adaptive_probe_delay_seconds() -> int:
    lo = max(30, _adaptive_provider_concurrency_probe_min_seconds())
    hi = max(lo, _adaptive_provider_concurrency_probe_max_seconds())
    return random.randint(lo, hi)


def _adaptive_probe_delay_seconds_for_gap(
    *,
    configured_cap: int,
    effective_cap: int,
) -> int:
    """
    Shorten probe delay when learned cap is far below configured cap.

    This helps pinned queues recover throughput faster after temporary provider
    pressure instead of waiting 2-3 minutes between every probe step.
    """
    delay = _adaptive_probe_delay_seconds()
    cap_gap = max(0, int(configured_cap) - int(effective_cap))
    if cap_gap >= 4:
        return min(delay, 45)
    if cap_gap >= 2:
        return min(delay, 75)
    return delay


def _adaptive_probe_successes_required_for_gap(
    *,
    configured_cap: int,
    effective_cap: int,
) -> int:
    """
    Probe-success evidence required before raising effective cap.

    When cap is heavily clamped (large gap), raise one step on a single probe
    success to recover capacity faster.
    """
    base_required = _adaptive_provider_concurrency_raise_after_consecutive_probe_successes()
    cap_gap = max(0, int(configured_cap) - int(effective_cap))
    if cap_gap >= 4:
        return 1
    return base_required


def _adaptive_defer_jitter_seconds() -> int:
    hi = max(0, _adaptive_provider_concurrency_defer_jitter_max_seconds())
    return random.randint(0, hi) if hi > 0 else 0


def _adaptive_provider_concurrency_key(
    generation: Generation,
    account: ProviderAccount,
    model: str | None,
) -> str:
    provider_id = str(getattr(account, "provider_id", "") or "unknown").lower()
    operation_type = (_get_operation_value(generation) or "unknown").lower()
    model_key = (str(model).strip().lower() if model else "_any")
    model_key = model_key.replace(":", "_").replace(" ", "_")
    return (
        "generation:provider_concurrency_adaptive:"
        f"{provider_id}:acct:{account.id}:op:{operation_type}:model:{model_key}"
    )


def _adaptive_provider_probe_lock_key(state_key: str) -> str:
    return f"{state_key}:probe_lock"


def _pinned_concurrent_wait_counter_key(generation_id: int) -> str:
    return f"generation:pinned_concurrent_wait_count:{generation_id}"


# ---------------------------------------------------------------------------
# Pinned concurrent wait counter (Redis)
# ---------------------------------------------------------------------------

async def _get_pinned_concurrent_wait_count(
    generation_id: int,
    *,
    gen_logger=None,
) -> int | None:
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        raw = await redis_client.get(_pinned_concurrent_wait_counter_key(generation_id))
        if raw is None:
            return 0
        return max(0, int(raw))
    except Exception as e:
        if gen_logger:
            gen_logger.debug("pinned_concurrent_wait_count_get_failed", error=str(e))
        return None


async def _increment_pinned_concurrent_wait_count(
    generation_id: int,
    *,
    gen_logger=None,
) -> int | None:
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        key = _pinned_concurrent_wait_counter_key(generation_id)
        new_count = await redis_client.incr(key)
        await redis_client.expire(key, _pinned_concurrent_wait_counter_ttl_seconds())
        return max(0, int(new_count))
    except Exception as e:
        if gen_logger:
            gen_logger.debug("pinned_concurrent_wait_count_incr_failed", error=str(e))
        return None


async def _clear_pinned_concurrent_wait_count(
    generation_id: int,
    *,
    gen_logger=None,
) -> None:
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        await redis_client.delete(_pinned_concurrent_wait_counter_key(generation_id))
    except Exception as e:
        if gen_logger:
            gen_logger.debug("pinned_concurrent_wait_count_clear_failed", error=str(e))


# ---------------------------------------------------------------------------
# Adaptive concurrency state (Redis hash)
# ---------------------------------------------------------------------------

async def _load_adaptive_provider_concurrency_state(
    generation: Generation,
    account: ProviderAccount,
    model: str | None,
    *,
    gen_logger=None,
) -> dict[str, Any] | None:
    if not _adaptive_provider_concurrency_enabled():
        return None
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        state_key = _adaptive_provider_concurrency_key(generation, account, model)
        raw = await redis_client.hgetall(state_key)
        if not raw:
            return {
                "state_key": state_key,
                "configured_cap": _normalize_positive_int(
                    getattr(account, "max_concurrent_jobs", 1), 1
                ),
                "effective_cap": _normalize_positive_int(
                    getattr(account, "max_concurrent_jobs", 1), 1
                ),
                "next_probe_at_ts": 0,
            }

        configured_cap = _normalize_positive_int(
            raw.get("configured_cap") or getattr(account, "max_concurrent_jobs", 1),
            1,
        )
        configured_cap = _clamp_provider_cap(
            configured_cap,
            _normalize_positive_int(getattr(account, "max_concurrent_jobs", 1), 1),
        )
        effective_cap = _clamp_provider_cap(
            _normalize_positive_int(raw.get("effective_cap"), configured_cap),
            configured_cap,
        )
        next_probe_at_ts = int(float(raw.get("next_probe_at_ts") or 0))
        return {
            "state_key": state_key,
            "configured_cap": configured_cap,
            "effective_cap": effective_cap,
            "next_probe_at_ts": next_probe_at_ts,
            "last_error_at_ts": int(float(raw.get("last_error_at_ts") or 0)),
            "last_probe_started_at_ts": int(float(raw.get("last_probe_started_at_ts") or 0)),
            "last_probe_success_at_ts": int(float(raw.get("last_probe_success_at_ts") or 0)),
            "last_reject_local_concurrency": _normalize_positive_int(
                raw.get("last_reject_local_concurrency"), 1
            ),
            "last_limit_reject_attempted_level": _normalize_positive_int(
                raw.get("last_limit_reject_attempted_level"), 0
            ),
            "consecutive_limit_rejects": max(0, int(float(raw.get("consecutive_limit_rejects") or 0))),
            "consecutive_limit_rejects_level": _normalize_positive_int(
                raw.get("consecutive_limit_rejects_level"), 0
            ),
            "consecutive_in_cap_limit_rejects": max(
                0, int(float(raw.get("consecutive_in_cap_limit_rejects") or 0))
            ),
            "consecutive_probe_successes": max(0, int(float(raw.get("consecutive_probe_successes") or 0))),
            "consecutive_probe_successes_level": _normalize_positive_int(
                raw.get("consecutive_probe_successes_level"), 0
            ),
        }
    except Exception as e:
        if gen_logger:
            gen_logger.debug("adaptive_concurrency_state_load_failed", error=str(e))
        return None


async def _save_adaptive_provider_concurrency_state(
    state_key: str,
    mapping: dict[str, Any],
    *,
    gen_logger=None,
) -> None:
    if not _adaptive_provider_concurrency_enabled():
        return
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        str_mapping = {str(k): str(v) for k, v in mapping.items() if v is not None}
        if str_mapping:
            await redis_client.hset(state_key, mapping=str_mapping)
            await redis_client.expire(state_key, _adaptive_provider_concurrency_state_ttl_seconds())
    except Exception as e:
        if gen_logger:
            gen_logger.debug("adaptive_concurrency_state_save_failed", error=str(e))


async def _acquire_adaptive_provider_probe_lock(
    state_key: str,
    *,
    gen_logger=None,
) -> bool:
    if not _adaptive_provider_concurrency_enabled():
        return False
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        ok = await redis_client.set(
            _adaptive_provider_probe_lock_key(state_key),
            datetime.now(timezone.utc).isoformat(),
            ex=_adaptive_provider_concurrency_probe_lock_ttl_seconds(),
            nx=True,
        )
        return bool(ok)
    except Exception as e:
        if gen_logger:
            gen_logger.debug("adaptive_concurrency_probe_lock_failed", error=str(e))
        return False


async def _release_adaptive_provider_probe_lock(
    state_key: str,
    *,
    gen_logger=None,
) -> None:
    if not _adaptive_provider_concurrency_enabled():
        return
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis

        redis_client = await get_redis()
        await redis_client.delete(_adaptive_provider_probe_lock_key(state_key))
    except Exception as e:
        if gen_logger:
            gen_logger.debug("adaptive_concurrency_probe_lock_release_failed", error=str(e))


# ---------------------------------------------------------------------------
# Pre-submit gate
# ---------------------------------------------------------------------------

async def _adaptive_provider_concurrency_pre_submit_gate(
    *,
    generation: Generation,
    account: ProviderAccount,
    model: str | None,
    gen_logger,
) -> dict[str, Any]:
    """Gate provider submits for pinned accounts using learned effective cap."""
    if not _adaptive_provider_concurrency_enabled():
        return {"action": "allow", "reason": "disabled"}

    state = await _load_adaptive_provider_concurrency_state(
        generation, account, model, gen_logger=gen_logger
    )
    if not state:
        return {"action": "allow", "reason": "state_unavailable"}

    configured_cap = _normalize_positive_int(getattr(account, "max_concurrent_jobs", 1), 1)
    effective_cap = _clamp_provider_cap(state.get("effective_cap", configured_cap), configured_cap)
    local_concurrency = _normalize_positive_int(getattr(account, "current_processing_jobs", 1), 1)
    now_ts = int(datetime.now(timezone.utc).timestamp())
    next_probe_at_ts = int(state.get("next_probe_at_ts") or 0)
    over_effective = local_concurrency > effective_cap

    decision = {
        "action": "allow",
        "reason": "within_effective_cap",
        "state_key": state["state_key"],
        "configured_cap": configured_cap,
        "effective_cap": effective_cap,
        "local_concurrency": local_concurrency,
        "attempted_level": local_concurrency,
        "next_probe_at_ts": next_probe_at_ts,
    }

    if not over_effective or effective_cap >= configured_cap:
        return decision

    can_probe = (
        local_concurrency >= (effective_cap + 1)
        and now_ts >= next_probe_at_ts
        and await _acquire_adaptive_provider_probe_lock(state["state_key"], gen_logger=gen_logger)
    )
    if can_probe:
        next_probe_delay = _adaptive_probe_delay_seconds_for_gap(
            configured_cap=configured_cap,
            effective_cap=effective_cap,
        )
        await _save_adaptive_provider_concurrency_state(
            state["state_key"],
            {
                "configured_cap": configured_cap,
                "effective_cap": effective_cap,
                "last_probe_started_at_ts": now_ts,
                "next_probe_at_ts": now_ts + next_probe_delay,
                "updated_at_ts": now_ts,
            },
            gen_logger=gen_logger,
        )
        decision.update(
            {
                "action": "allow_probe",
                "reason": "adaptive_probe_window",
                "probe": True,
                "attempted_level": effective_cap + 1,
                "next_probe_delay_seconds": next_probe_delay,
            }
        )
        return decision

    seconds_until_probe = (
        max(1, next_probe_at_ts - now_ts)
        if next_probe_at_ts > now_ts
        else _adaptive_probe_delay_seconds_for_gap(
            configured_cap=configured_cap,
            effective_cap=effective_cap,
        )
    )
    base_defer = _get_concurrent_limit_cooldown_seconds(generation, account) + _pinned_wait_padding_seconds()
    probe_wait_with_jitter = seconds_until_probe + _adaptive_defer_jitter_seconds()
    if local_concurrency < configured_cap:
        # When the account still has global headroom, re-check sooner instead of
        # idling until the full probe window elapses.
        defer_seconds = max(base_defer, min(probe_wait_with_jitter, base_defer * 3))
    else:
        defer_seconds = max(base_defer, probe_wait_with_jitter)
    decision.update(
        {
            "action": "defer",
            "reason": "adaptive_effective_cap",
            "defer_seconds": defer_seconds,
            "seconds_until_probe": seconds_until_probe,
        }
    )
    return decision


# ---------------------------------------------------------------------------
# Post-submit recording
# ---------------------------------------------------------------------------

async def _adaptive_provider_concurrency_record_limit_error(
    *,
    generation: Generation,
    account: ProviderAccount,
    model: str | None,
    local_concurrency: int | None,
    attempted_level_hint: int | None = None,
    gen_logger,
) -> dict[str, Any] | None:
    if not _adaptive_provider_concurrency_enabled():
        return None

    state = await _load_adaptive_provider_concurrency_state(
        generation, account, model, gen_logger=gen_logger
    )
    if not state:
        return None

    configured_cap = _normalize_positive_int(getattr(account, "max_concurrent_jobs", 1), 1)
    existing_effective = _clamp_provider_cap(state.get("effective_cap", configured_cap), configured_cap)
    observed_local = _normalize_positive_int(local_concurrency or getattr(account, "current_processing_jobs", 1), 1)
    attempted_level = _normalize_positive_int(attempted_level_hint or observed_local, 1)
    observed_cap = _clamp_provider_cap(max(1, attempted_level - 1), configured_cap)
    is_probe_level_reject = attempted_level > existing_effective

    previous_reject_level = _normalize_positive_int(state.get("consecutive_limit_rejects_level"), 0)
    if previous_reject_level == attempted_level:
        consecutive_rejects = max(0, int(state.get("consecutive_limit_rejects") or 0)) + 1
    else:
        consecutive_rejects = 1
    previous_in_cap_rejects = max(0, int(state.get("consecutive_in_cap_limit_rejects") or 0))
    consecutive_in_cap_rejects = (
        previous_in_cap_rejects + 1 if not is_probe_level_reject else previous_in_cap_rejects
    )
    lower_after_rejects = _adaptive_provider_concurrency_lower_after_consecutive_rejects()
    should_lower = (
        existing_effective > 1
        and not is_probe_level_reject
        and consecutive_in_cap_rejects >= lower_after_rejects
    )
    new_effective = existing_effective - 1 if should_lower else existing_effective
    now_ts = int(datetime.now(timezone.utc).timestamp())
    probe_delay = _adaptive_probe_delay_seconds_for_gap(
        configured_cap=configured_cap,
        effective_cap=new_effective,
    )
    next_probe_at_ts = now_ts + probe_delay

    await _save_adaptive_provider_concurrency_state(
        state["state_key"],
        {
            "configured_cap": configured_cap,
            "effective_cap": new_effective,
            "last_error_at_ts": now_ts,
            "last_reject_local_concurrency": observed_local,
            "last_limit_reject_attempted_level": attempted_level,
            "consecutive_limit_rejects": 0 if should_lower else consecutive_rejects,
            "consecutive_limit_rejects_level": 0 if should_lower else attempted_level,
            "consecutive_in_cap_limit_rejects": 0 if should_lower else consecutive_in_cap_rejects,
            "consecutive_probe_successes": 0,
            "consecutive_probe_successes_level": 0,
            "next_probe_at_ts": next_probe_at_ts,
            "updated_at_ts": now_ts,
        },
        gen_logger=gen_logger,
    )
    await _release_adaptive_provider_probe_lock(state["state_key"], gen_logger=gen_logger)

    return {
        "state_key": state["state_key"],
        "configured_cap": configured_cap,
        "previous_effective_cap": existing_effective,
        "effective_cap": new_effective,
        "attempted_level": attempted_level,
        "observed_local_concurrency": observed_local,
        "observed_cap": observed_cap,
        "consecutive_limit_rejects": consecutive_rejects,
        "consecutive_limit_rejects_level": attempted_level,
        "consecutive_in_cap_limit_rejects": consecutive_in_cap_rejects,
        "lower_after_consecutive_rejects": lower_after_rejects,
        "is_probe_level_reject": is_probe_level_reject,
        "cap_lowered": should_lower,
        "next_probe_at_ts": next_probe_at_ts,
        "next_probe_delay_seconds": probe_delay,
        "adaptive_active": new_effective < configured_cap,
        "recommended_defer_seconds": max(
            _get_concurrent_limit_cooldown_seconds(generation, account) + _pinned_wait_padding_seconds(),
            probe_delay + _adaptive_defer_jitter_seconds(),
        ),
    }


async def _adaptive_provider_concurrency_record_submit_success(
    *,
    generation: Generation,
    account: ProviderAccount,
    model: str | None,
    local_concurrency: int | None,
    attempted_level_hint: int | None = None,
    gen_logger,
) -> None:
    if not _adaptive_provider_concurrency_enabled():
        return

    state = await _load_adaptive_provider_concurrency_state(
        generation, account, model, gen_logger=gen_logger
    )
    if not state:
        return

    configured_cap = _normalize_positive_int(getattr(account, "max_concurrent_jobs", 1), 1)
    current_effective = _clamp_provider_cap(state.get("effective_cap", configured_cap), configured_cap)
    observed_local = _normalize_positive_int(local_concurrency or getattr(account, "current_processing_jobs", 1), 1)
    attempted_level = _normalize_positive_int(attempted_level_hint or observed_local, 1)
    now_ts = int(datetime.now(timezone.utc).timestamp())

    if attempted_level > current_effective and current_effective < configured_cap:
        previous_probe_success_level = _normalize_positive_int(
            state.get("consecutive_probe_successes_level"),
            0,
        )
        if previous_probe_success_level == attempted_level:
            consecutive_probe_successes = max(0, int(state.get("consecutive_probe_successes") or 0)) + 1
        else:
            consecutive_probe_successes = 1
        raise_after_probe_successes = _adaptive_probe_successes_required_for_gap(
            configured_cap=configured_cap,
            effective_cap=current_effective,
        )
        next_probe_delay = _adaptive_probe_delay_seconds_for_gap(
            configured_cap=configured_cap,
            effective_cap=current_effective,
        )
        if consecutive_probe_successes < raise_after_probe_successes:
            await _save_adaptive_provider_concurrency_state(
                state["state_key"],
                {
                    "configured_cap": configured_cap,
                    "effective_cap": current_effective,
                    "last_probe_success_at_ts": now_ts,
                    "consecutive_limit_rejects": 0,
                    "consecutive_limit_rejects_level": 0,
                    "consecutive_in_cap_limit_rejects": 0,
                    "consecutive_probe_successes": consecutive_probe_successes,
                    "consecutive_probe_successes_level": attempted_level,
                    "next_probe_at_ts": now_ts + next_probe_delay,
                    "updated_at_ts": now_ts,
                },
                gen_logger=gen_logger,
            )
            await _release_adaptive_provider_probe_lock(state["state_key"], gen_logger=gen_logger)
            gen_logger.info(
                "adaptive_concurrency_probe_success_evidence",
                account_id=account.id,
                provider_id=getattr(account, "provider_id", None),
                operation_type=_get_operation_value(generation),
                model=model,
                attempted_level=attempted_level,
                effective_cap=current_effective,
                configured_cap=configured_cap,
                consecutive_probe_successes=consecutive_probe_successes,
                raise_after_probe_successes=raise_after_probe_successes,
                accepted_local_concurrency=observed_local,
            )
            return

        new_effective = _clamp_provider_cap(current_effective + 1, configured_cap)
        await _save_adaptive_provider_concurrency_state(
            state["state_key"],
            {
                "configured_cap": configured_cap,
                "effective_cap": new_effective,
                "last_probe_success_at_ts": now_ts,
                "consecutive_limit_rejects": 0,
                "consecutive_limit_rejects_level": 0,
                "consecutive_in_cap_limit_rejects": 0,
                "consecutive_probe_successes": 0,
                "consecutive_probe_successes_level": 0,
                "next_probe_at_ts": now_ts + next_probe_delay,
                "updated_at_ts": now_ts,
            },
            gen_logger=gen_logger,
        )
        await _release_adaptive_provider_probe_lock(state["state_key"], gen_logger=gen_logger)
        gen_logger.info(
            "adaptive_concurrency_cap_raised",
            account_id=account.id,
            provider_id=getattr(account, "provider_id", None),
            operation_type=_get_operation_value(generation),
            model=model,
            previous_effective_cap=current_effective,
            effective_cap=new_effective,
            configured_cap=configured_cap,
            attempted_level=attempted_level,
            raise_after_probe_successes=raise_after_probe_successes,
            accepted_local_concurrency=observed_local,
        )
        return

    # Keep state warm but avoid changing cap on normal in-cap submits.
    if current_effective < configured_cap:
        await _save_adaptive_provider_concurrency_state(
            state["state_key"],
            {
                "configured_cap": configured_cap,
                "effective_cap": current_effective,
                "consecutive_limit_rejects": 0,
                "consecutive_limit_rejects_level": 0,
                "consecutive_in_cap_limit_rejects": 0,
                "updated_at_ts": now_ts,
            },
            gen_logger=gen_logger,
        )


# ---------------------------------------------------------------------------
# Pinned sibling counting & defer planning
# ---------------------------------------------------------------------------

async def _count_runnable_pinned_siblings(
    db: AsyncSession,
    preferred_account_id: int,
    exclude_generation_id: int,
    current_generation_created_at: datetime | None,
) -> dict[str, int]:
    """Count runnable sibling generations for fairness decisions."""
    from sqlalchemy import select, func, or_, and_
    from pixsim7.backend.main.domain.enums import GenerationStatus as GenStatus

    now = datetime.now(timezone.utc)
    runnable_filter = or_(
        Generation.scheduled_at.is_(None),
        Generation.scheduled_at <= now,
    )
    base_query = (
        select(func.count())
        .select_from(Generation)
        .where(
            Generation.preferred_account_id == preferred_account_id,
            Generation.status == GenStatus.PENDING,
            Generation.id != exclude_generation_id,
            runnable_filter,
        )
    )

    total_runnable = int((await db.scalar(base_query)) or 0)
    fresher_runnable = 0
    if current_generation_created_at is not None:
        fresher_query = base_query.where(
            or_(
                Generation.created_at > current_generation_created_at,
                and_(
                    Generation.created_at == current_generation_created_at,
                    Generation.id > exclude_generation_id,
                ),
            )
        )
        fresher_runnable = int((await db.scalar(fresher_query)) or 0)

    return {
        "total_runnable": total_runnable,
        "fresher_runnable": fresher_runnable,
    }


async def _plan_pinned_concurrent_defer(
    *,
    db: AsyncSession,
    generation: Generation,
    account: ProviderAccount,
    concurrent_cooldown_seconds: int,
    current_retry_count: int,
    gen_logger,
    adaptive_recommended_defer_seconds: int | None = None,
) -> dict[str, Any]:
    """Compute pinned concurrent wait behavior (fairness + backoff + guardrails)."""
    base_defer = concurrent_cooldown_seconds + _pinned_wait_padding_seconds()
    defer_seconds = base_defer
    reason = "pinned_account_concurrent_wait"
    increment_retry = True

    if adaptive_recommended_defer_seconds is not None:
        defer_seconds = max(base_defer, int(adaptive_recommended_defer_seconds))
        reason = "pinned_account_adaptive_concurrent_wait"
        increment_retry = False

    wait_count = await _increment_pinned_concurrent_wait_count(
        generation.id,
        gen_logger=gen_logger,
    )
    if wait_count is None:
        wait_count = (current_retry_count or 0) + 1

    if wait_count > _max_pinned_concurrent_waits():
        return {
            "action": "stop",
            "stop_reason": "max_concurrent_waits_exceeded",
            "wait_count": wait_count,
            "max_waits": _max_pinned_concurrent_waits(),
        }

    yield_threshold = int(MAX_PINNED_CONCURRENT_RETRIES * PINNED_YIELD_THRESHOLD_RATIO)
    sibling_counts = {"total_runnable": 0, "fresher_runnable": 0}
    if wait_count >= yield_threshold and generation.preferred_account_id is not None:
        sibling_counts = await _count_runnable_pinned_siblings(
            db,
            generation.preferred_account_id,
            generation.id,
            getattr(generation, "created_at", None),
        )
        fresher = sibling_counts.get("fresher_runnable", 0)
        if fresher > 0:
            yield_defer = base_defer * PINNED_YIELD_DEFER_MULTIPLIER
            defer_seconds = max(defer_seconds, yield_defer)
            reason = (
                "pinned_account_adaptive_concurrent_yield"
                if adaptive_recommended_defer_seconds is not None
                else "pinned_account_concurrent_yield"
            )
            gen_logger.info(
                "pinned_concurrent_yielding",
                generation_id=generation.id,
                retry_count=current_retry_count,
                concurrent_wait_count=wait_count,
                runnable_siblings=sibling_counts.get("total_runnable", 0),
                fresher_runnable_siblings=fresher,
                defer_seconds=defer_seconds,
                base_defer_seconds=base_defer,
            )

    return {
        "action": "defer",
        "defer_seconds": defer_seconds,
        "reason": reason,
        "increment_retry": increment_retry,
        "concurrent_wait_count": wait_count,
        "base_defer_seconds": base_defer,
        "sibling_counts": sibling_counts,
    }
