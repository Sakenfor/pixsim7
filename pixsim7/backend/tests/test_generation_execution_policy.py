import pytest

from pixsim7.backend.main.services.generation.execution_policy import (
    normalize_chain_execution_policy,
    normalize_fanout_execution_policy,
    normalize_item_execution_policy,
)


def test_chain_policy_defaults_from_legacy_fields() -> None:
    policy = normalize_chain_execution_policy(None, legacy_step_timeout=321.0)

    assert policy.dispatch_mode == "sequential"
    assert policy.wait_policy == "terminal_per_step"
    assert policy.dependency_mode == "previous"
    assert policy.failure_policy == "stop"
    assert policy.concurrency == 1
    assert policy.step_timeout_seconds == 321.0


def test_fanout_policy_defaults_from_legacy_fields() -> None:
    policy = normalize_fanout_execution_policy(
        None,
        legacy_continue_on_error=False,
        legacy_force_new=True,
    )

    assert policy.dispatch_mode == "fanout"
    assert policy.wait_policy == "none"
    assert policy.dependency_mode == "none"
    assert policy.failure_policy == "stop"
    assert policy.force_new is True


def test_chain_policy_rejects_non_sequential_dispatch_mode() -> None:
    with pytest.raises(ValueError, match="dispatch_mode='sequential'"):
        normalize_chain_execution_policy({"dispatch_mode": "fanout"})


def test_fanout_policy_accepts_failure_policy_override() -> None:
    policy = normalize_fanout_execution_policy(
        {"failure_policy": "continue", "force_new": False},
        legacy_continue_on_error=False,
        legacy_force_new=True,
    )
    assert policy.failure_policy == "continue"
    assert policy.force_new is False


def test_fanout_policy_rejects_waiting_modes() -> None:
    with pytest.raises(ValueError, match="wait_policy='none'"):
        normalize_fanout_execution_policy({"wait_policy": "terminal_final"})


def test_item_policy_allows_sequential_previous() -> None:
    policy = normalize_item_execution_policy(
        {
            "dispatch_mode": "sequential",
            "wait_policy": "terminal_per_step",
            "dependency_mode": "previous",
            "failure_policy": "continue",
            "step_timeout_seconds": 45,
        },
        legacy_continue_on_error=True,
        legacy_force_new=True,
    )
    assert policy.dispatch_mode == "sequential"
    assert policy.dependency_mode == "previous"
    assert policy.wait_policy == "terminal_per_step"
    assert policy.failure_policy == "continue"
    assert policy.step_timeout_seconds == 45


def test_item_policy_rejects_invalid_sequential_wait_mode() -> None:
    with pytest.raises(ValueError, match="wait_policy='terminal_per_step'"):
        normalize_item_execution_policy(
            {
                "dispatch_mode": "sequential",
                "wait_policy": "none",
            }
        )
