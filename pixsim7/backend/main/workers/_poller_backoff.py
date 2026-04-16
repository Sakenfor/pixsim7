"""
Poll-error backoff state for the status poller.

Tracks two backoff regimes for provider status polls:

- Transient errors (network, timeout, DNS): short staircase cooldowns
  per (generation, submission, account, job_id) tuple. A long enough
  quiet window (``_TRANSIENT_POLL_FAILURE_RESET_SEC``) clears the
  failure count.
- Non-transient errors (auth, session, API): a few retries before the
  poller fails the generation; prevents a single auth hiccup from
  orphaning an in-flight provider job.

Concurrency thresholds live here too — when many transient backoffs are
active the poller drops to ``_POLL_CONCURRENCY_DEGRADED`` workers.

Module-level dicts are intentionally shared mutable state. The status
poller imports them as aliases; mutations are observed everywhere.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from pixsim7.backend.main.domain.enums import GenerationErrorCode
from pixsim7.backend.main.shared.errors import ProviderError


@dataclass(slots=True)
class _TransientPollBackoffState:
    failures: int = 0
    cooldown_until_mono: float = 0.0
    last_failure_mono: float = 0.0


_TRANSIENT_POLL_BACKOFF_STEPS_SEC: tuple[int, ...] = (10, 20, 30, 45, 60)
_TRANSIENT_POLL_FAILURE_RESET_SEC = 120.0
_TRANSIENT_POLL_PRUNE_STALE_SEC = 900.0
_POLL_CONCURRENCY_NORMAL = 10
_POLL_CONCURRENCY_DEGRADED = 4
_POLL_CONCURRENCY_DEGRADE_THRESHOLD = 5
_transient_poll_backoff: dict[str, _TransientPollBackoffState] = {}

# Non-transient poll errors (auth, session, API) get a few retries before
# failing the generation.  This prevents a single auth hiccup from orphaning
# a generation that is still running on the provider's side.
_NON_TRANSIENT_POLL_MAX_FAILURES = 3
_NON_TRANSIENT_POLL_BACKOFF_STEPS_SEC: tuple[int, ...] = (15, 30, 60)
_non_transient_poll_backoff: dict[str, _TransientPollBackoffState] = {}

_BACKOFF_DICT_MAX_SIZE = 2000

# Adaptive poll cadence: non-error throttle that stretches the poll interval
# per-generation based on observed lifecycle.  Mid-render nothing changes on
# the provider side, so polling every tick wastes calls.  Stored as
# ``{key: next_poll_at_mono}`` — cleared implicitly when the entry goes stale
# (terminal generations drop out of the processing snapshot, so their keys
# are pruned by ``_prune_poll_backoff_dicts``).
_adaptive_poll_schedule: dict[str, float] = {}


def _iter_exception_chain(error: BaseException, *, max_depth: int = 8) -> Iterable[BaseException]:
    current: BaseException | None = error
    seen: set[int] = set()
    depth = 0
    while current is not None and id(current) not in seen and depth < max_depth:
        yield current
        seen.add(id(current))
        current = current.__cause__ or current.__context__
        depth += 1


def _is_transient_network_error(error: Exception) -> bool:
    type_markers = (
        "connecterror",
        "connecttimeout",
        "readtimeout",
        "writeerror",
        "pooltimeout",
        "networkerror",
        "transporterror",
        "gaierror",
        "timeouterror",
        "remotedisconnected",
    )
    message_markers = (
        "all connection attempts failed",
        "connection refused",
        "connection reset",
        "connection aborted",
        "network is unreachable",
        "no route to host",
        "temporary failure in name resolution",
        "name or service not known",
        "nodename nor servname provided",
        "getaddrinfo failed",
        "cannot assign requested address",
        "remote host closed",
        "forcibly closed by the remote host",
        "server disconnected",
        "tls handshake",
        "winerror 10048",
        "winerror 10049",
        "winerror 10050",
        "winerror 10051",
        "winerror 10053",
        "winerror 10054",
        "winerror 11001",
    )
    for exc in _iter_exception_chain(error):
        exc_type = exc.__class__.__name__.lower()
        if any(marker in exc_type for marker in type_markers):
            return True
        exc_msg = str(exc).lower()
        if any(marker in exc_msg for marker in message_markers):
            return True
    return False


def _is_transient_provider_poll_error(error: ProviderError) -> bool:
    error_code = str(getattr(error, "error_code", "") or "").lower()
    if error_code in {
        GenerationErrorCode.PROVIDER_TIMEOUT.value,
        GenerationErrorCode.PROVIDER_UNAVAILABLE.value,
    }:
        return True
    return _is_transient_network_error(error)


def _transient_poll_key(
    *,
    generation_id: int,
    submission_id: int,
    account_id: int | None,
    provider_job_id: str | None,
) -> str:
    return f"{generation_id}:{submission_id}:{account_id or 0}:{provider_job_id or '-'}"


def _get_transient_poll_backoff_remaining(key: str, *, now_mono: float) -> float:
    state = _transient_poll_backoff.get(key)
    if state is None:
        return 0.0
    if state.last_failure_mono and (now_mono - state.last_failure_mono) > _TRANSIENT_POLL_FAILURE_RESET_SEC:
        state.failures = 0
    remaining = state.cooldown_until_mono - now_mono
    return remaining if remaining > 0 else 0.0


def _record_transient_poll_backoff(key: str, *, now_mono: float) -> tuple[int, int]:
    state = _transient_poll_backoff.setdefault(key, _TransientPollBackoffState())
    if state.last_failure_mono and (now_mono - state.last_failure_mono) > _TRANSIENT_POLL_FAILURE_RESET_SEC:
        state.failures = 0
    state.failures += 1
    state.last_failure_mono = now_mono
    backoff_index = min(state.failures - 1, len(_TRANSIENT_POLL_BACKOFF_STEPS_SEC) - 1)
    delay_sec = int(_TRANSIENT_POLL_BACKOFF_STEPS_SEC[backoff_index])
    state.cooldown_until_mono = now_mono + delay_sec
    return state.failures, delay_sec


def _clear_transient_poll_backoff(key: str | None) -> None:
    if key:
        _transient_poll_backoff.pop(key, None)
        _non_transient_poll_backoff.pop(key, None)


def _prune_poll_backoff_dicts(*, now_mono: float) -> None:
    """Drop expired/stale entries from both backoff dicts; cap each at ``_BACKOFF_DICT_MAX_SIZE``."""
    stale_before = now_mono - _TRANSIENT_POLL_PRUNE_STALE_SEC
    for backoff_dict in (_transient_poll_backoff, _non_transient_poll_backoff):
        stale_keys = [
            key
            for key, state in backoff_dict.items()
            if state.cooldown_until_mono <= now_mono and state.last_failure_mono <= stale_before
        ]
        for key in stale_keys:
            backoff_dict.pop(key, None)
        if len(backoff_dict) > _BACKOFF_DICT_MAX_SIZE:
            sorted_keys = sorted(
                backoff_dict, key=lambda k: backoff_dict[k].last_failure_mono
            )
            for key in sorted_keys[: len(backoff_dict) - _BACKOFF_DICT_MAX_SIZE]:
                backoff_dict.pop(key, None)

    # Adaptive schedule prune: keep only future targets + cap size.  A key
    # whose target is in the past and was never refreshed belongs to a
    # generation that's no longer processing (terminal or evicted).
    adaptive_stale = [
        key for key, target in _adaptive_poll_schedule.items() if target <= now_mono
    ]
    for key in adaptive_stale:
        _adaptive_poll_schedule.pop(key, None)
    if len(_adaptive_poll_schedule) > _BACKOFF_DICT_MAX_SIZE:
        sorted_keys = sorted(_adaptive_poll_schedule, key=_adaptive_poll_schedule.get)
        for key in sorted_keys[: len(_adaptive_poll_schedule) - _BACKOFF_DICT_MAX_SIZE]:
            _adaptive_poll_schedule.pop(key, None)


def _record_non_transient_poll_backoff(key: str, *, now_mono: float) -> tuple[int, int]:
    """Record a non-transient poll error and return (failure_count, backoff_seconds)."""
    state = _non_transient_poll_backoff.setdefault(key, _TransientPollBackoffState())
    if state.last_failure_mono and (now_mono - state.last_failure_mono) > _TRANSIENT_POLL_FAILURE_RESET_SEC:
        state.failures = 0
    state.failures += 1
    state.last_failure_mono = now_mono
    backoff_index = min(state.failures - 1, len(_NON_TRANSIENT_POLL_BACKOFF_STEPS_SEC) - 1)
    delay_sec = int(_NON_TRANSIENT_POLL_BACKOFF_STEPS_SEC[backoff_index])
    state.cooldown_until_mono = now_mono + delay_sec
    return state.failures, delay_sec


def _get_non_transient_poll_backoff_remaining(key: str, *, now_mono: float) -> float:
    state = _non_transient_poll_backoff.get(key)
    if state is None:
        return 0.0
    if state.last_failure_mono and (now_mono - state.last_failure_mono) > _TRANSIENT_POLL_FAILURE_RESET_SEC:
        state.failures = 0
    remaining = state.cooldown_until_mono - now_mono
    return remaining if remaining > 0 else 0.0


def _record_adaptive_poll_defer(
    key: str,
    defer_seconds: float,
    *,
    now_mono: float,
) -> None:
    """Schedule the next poll for ``key`` at ``now_mono + defer_seconds``.

    Unlike the error-driven backoff dicts this is NOT keyed by a failure
    count — each successful poll overwrites the schedule with the current
    tier's cadence.  A zero or negative ``defer_seconds`` clears any
    existing schedule (back to default every-tick cadence).
    """
    if defer_seconds <= 0:
        _adaptive_poll_schedule.pop(key, None)
        return
    _adaptive_poll_schedule[key] = now_mono + defer_seconds


def _get_adaptive_poll_defer_remaining(key: str, *, now_mono: float) -> float:
    """Seconds remaining before the next adaptive poll is allowed; 0 if due."""
    target = _adaptive_poll_schedule.get(key)
    if target is None:
        return 0.0
    remaining = target - now_mono
    return remaining if remaining > 0 else 0.0


def _clear_adaptive_poll_defer(key: str | None) -> None:
    if key:
        _adaptive_poll_schedule.pop(key, None)


def _active_transient_poll_backoffs(*, now_mono: float) -> int:
    return sum(
        1
        for state in _transient_poll_backoff.values()
        if state.cooldown_until_mono > now_mono
    )
