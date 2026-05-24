"""
Tests for Discriminator A (spurious 500044 handling) in worker_concurrency.

Background — see plan ``pixverse-spurious-concurrent-limit``:
Pixverse intermittently returns ErrCode 500044 ("concurrent limit reached")
for problematic prompts even when local concurrency is far below the account's
configured cap. A genuine concurrent-limit can only happen when the account
actually has >= configured_cap jobs in flight, so a 500044 at low local
concurrency is *spurious* (prompt-induced) and must NOT lower the learned cap.

Incident that motivated this: acct 2 (configured cap 8) was driven 8 -> 1 by
33 consecutive spurious 500044s, all at local_concurrency=1.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from pixsim7.backend.main.workers.worker_concurrency import (
    _adaptive_provider_concurrency_record_limit_error,
    seed_agnostic_prompt_group_hash,
)


class _NoopLogger:
    def info(self, *a, **kw): pass
    def warning(self, *a, **kw): pass
    def debug(self, *a, **kw): pass


def _make_generation(prompt: str = "a cat", seed: int = 1, image: str = "asset:1") -> SimpleNamespace:
    return SimpleNamespace(
        id=42,
        user_id=1,
        provider_id="pixverse",
        operation_type="image_to_image",
        canonical_params={"model": "gemini-3.1-flash", "prompt": prompt, "seed": seed},
        inputs=[{"asset": image}],
    )


def _make_account(max_concurrent_jobs: int = 8, current: int = 1) -> SimpleNamespace:
    return SimpleNamespace(
        id=2,
        provider_id="pixverse",
        max_concurrent_jobs=max_concurrent_jobs,
        current_processing_jobs=current,
    )


def _state(*, effective_cap: int, configured_cap: int, in_cap_rejects: int) -> dict:
    return {
        "state_key": "generation:provider_concurrency_adaptive:pixverse:acct:2:op:image_to_image:model:gemini-3.1-flash",
        "configured_cap": configured_cap,
        "effective_cap": effective_cap,
        "next_probe_at_ts": 0,
        "last_error_at_ts": 0,
        "last_probe_started_at_ts": 0,
        "last_probe_success_at_ts": 0,
        "last_reject_local_concurrency": 1,
        "last_limit_reject_attempted_level": 1,
        "consecutive_limit_rejects": in_cap_rejects,
        "consecutive_limit_rejects_level": 1,
        "consecutive_in_cap_limit_rejects": in_cap_rejects,
        "consecutive_probe_successes": 0,
        "consecutive_probe_successes_level": 0,
    }


def _patches(state: dict):
    """Patch the Redis-touching helpers so the decision logic runs in isolation."""
    base = "pixsim7.backend.main.workers.worker_concurrency."
    return (
        patch(base + "_load_adaptive_provider_concurrency_state",
              new_callable=AsyncMock, return_value=state),
        patch(base + "_save_adaptive_provider_concurrency_state", new_callable=AsyncMock),
        patch(base + "_release_adaptive_provider_probe_lock", new_callable=AsyncMock),
        patch(base + "_set_account_effective_cap_hint", new_callable=AsyncMock),
    )


@pytest.mark.asyncio
async def test_spurious_reject_does_not_lower_cap():
    """500044 while local (1) < configured cap (8) is spurious -> cap stays 8."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=2)
    p_load, p_save, p_rel, p_hint = _patches(state)
    with p_load, p_save, p_rel, p_hint:
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=1),
            model="gemini-3.1-flash",
            local_concurrency=1,
            gen_logger=_NoopLogger(),
        )

    assert result is not None
    assert result["protect_cap"] is True
    assert result["cap_lowered"] is False
    assert result["effective_cap"] == 8  # unchanged
    assert result["prompt_group_hash"]  # attribution key present


@pytest.mark.asyncio
async def test_spurious_below_threshold_does_not_quarantine():
    """A lone spurious reject (count below threshold) must NOT quarantine."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=0)
    p_load, p_save, p_rel, p_hint = _patches(state)
    base = "pixsim7.backend.main.workers.worker_concurrency."
    with p_load, p_save, p_rel, p_hint, patch(
        base + "bump_spurious_concurrent_count", new_callable=AsyncMock, return_value=1,
    ), patch(base + "_spurious_concurrent_quarantine_threshold", return_value=3), patch(
        base + "_spurious_concurrent_quarantine_enabled", return_value=True,
    ):
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=1),
            model="gemini-3.1-flash",
            local_concurrency=1,
            gen_logger=_NoopLogger(),
        )

    assert result["is_idle_reject"] is True
    assert result["spurious_count"] == 1
    assert result["quarantine_now"] is False  # below threshold -> no pause
    assert result["cap_lowered"] is False


@pytest.mark.asyncio
async def test_spurious_at_threshold_quarantines():
    """Reaching the spurious threshold for the same request triggers quarantine."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=0)
    p_load, p_save, p_rel, p_hint = _patches(state)
    base = "pixsim7.backend.main.workers.worker_concurrency."
    with p_load, p_save, p_rel, p_hint, patch(
        base + "bump_spurious_concurrent_count", new_callable=AsyncMock, return_value=3,
    ), patch(base + "_spurious_concurrent_quarantine_threshold", return_value=3), patch(
        base + "_spurious_concurrent_quarantine_enabled", return_value=True,
    ):
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=1),
            model="gemini-3.1-flash",
            local_concurrency=1,
            gen_logger=_NoopLogger(),
        )

    assert result["is_idle_reject"] is True
    assert result["spurious_count"] == 3
    assert result["quarantine_now"] is True
    assert result["cap_lowered"] is False  # still never lowered while below cap


@pytest.mark.asyncio
async def test_quarantine_disabled_by_default():
    """With the quarantine setting off (default), even repeated idle-rejects
    never quarantine — cap protection still applies."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=0)
    p_load, p_save, p_rel, p_hint = _patches(state)
    base = "pixsim7.backend.main.workers.worker_concurrency."
    with p_load, p_save, p_rel, p_hint, patch(
        base + "_spurious_concurrent_quarantine_enabled", return_value=False,
    ):
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=1),
            model="gemini-3.1-flash",
            local_concurrency=1,
            gen_logger=_NoopLogger(),
        )

    assert result["protect_cap"] is True       # still protects the cap
    assert result["quarantine_now"] is False  # but never pauses when disabled
    assert result["cap_lowered"] is False


@pytest.mark.asyncio
async def test_subcap_reject_protects_cap_but_does_not_quarantine():
    """A 500044 below the configured cap (e.g. local=5 vs cap=8) is impossible
    as a real limit, so it must NOT lower the cap — but local=5 is above the
    idle floor, so it is not strong enough to quarantine either. This is the
    decoupled behaviour: cap protection is broad, quarantine is narrow."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=2)
    p_load, p_save, p_rel, p_hint = _patches(state)
    base = "pixsim7.backend.main.workers.worker_concurrency."
    with p_load, p_save, p_rel, p_hint, patch(
        base + "_spurious_concurrent_local_floor", return_value=1,
    ), patch(base + "_spurious_concurrent_quarantine_enabled", return_value=True):
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=5),
            model="gemini-3.1-flash",
            local_concurrency=5,  # below cap 8 -> protect; above floor 1 -> no quarantine
            gen_logger=_NoopLogger(),
        )

    assert result["protect_cap"] is True
    assert result["is_idle_reject"] is False
    assert result["quarantine_now"] is False
    assert result["cap_lowered"] is False  # cap is protected, NOT ratcheted down
    assert result["effective_cap"] == 8


@pytest.mark.asyncio
async def test_genuine_reject_at_cap_lowers():
    """500044 while local (8) == configured cap (8) is genuine -> cap may lower."""
    state = _state(effective_cap=8, configured_cap=8, in_cap_rejects=2)
    p_load, p_save, p_rel, p_hint = _patches(state)
    with p_load, p_save, p_rel, p_hint:
        result = await _adaptive_provider_concurrency_record_limit_error(
            generation=_make_generation(),
            account=_make_account(max_concurrent_jobs=8, current=8),
            model="gemini-3.1-flash",
            local_concurrency=8,
            gen_logger=_NoopLogger(),
        )

    assert result is not None
    assert result["protect_cap"] is False
    assert result["cap_lowered"] is True
    assert result["effective_cap"] == 7  # lowered to observed_cap (attempted_level - 1)


@pytest.mark.asyncio
async def test_seed_agnostic_grouping_ignores_seed():
    """Same prompt, different seeds -> same grouping hash."""
    h1 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a cat", seed=1))
    h2 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a cat", seed=999))
    assert h1 is not None
    assert h1 == h2


@pytest.mark.asyncio
async def test_seed_agnostic_grouping_differs_by_prompt():
    """Different prompts -> different grouping hash."""
    h1 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a cat", seed=1))
    h2 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a dog", seed=1))
    assert h1 != h2


@pytest.mark.asyncio
async def test_grouping_differs_by_input_image():
    """Same prompt, different input image -> different grouping hash.

    The trigger for a spurious 500044 can be an input image, not just the
    prompt. The key hashes inputs too, so quarantining one image+prompt combo
    does not over-block the same prompt with a different image.
    """
    h1 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a cat", image="asset:1"))
    h2 = seed_agnostic_prompt_group_hash(_make_generation(prompt="a cat", image="asset:2"))
    assert h1 != h2
