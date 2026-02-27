"""
Execution policy normalization for generation orchestration endpoints.

This module defines a small backend contract for execution behavior that can be
shared across execution kinds (`single`, `fanout`, `chain`) without forcing a
single endpoint shape yet.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Literal, Mapping, Optional


DispatchMode = Literal["single", "fanout", "sequential"]
WaitPolicy = Literal["none", "terminal_per_step", "terminal_final"]
DependencyMode = Literal["none", "previous", "explicit"]
FailurePolicy = Literal["stop", "continue"]


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


@dataclass(frozen=True)
class ExecutionPolicyV1:
    version: int
    dispatch_mode: DispatchMode
    wait_policy: WaitPolicy
    dependency_mode: DependencyMode
    failure_policy: FailurePolicy
    concurrency: int = 1
    step_timeout_seconds: Optional[float] = None
    force_new: Optional[bool] = None

    def to_metadata(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "version": self.version,
            "dispatch_mode": self.dispatch_mode,
            "wait_policy": self.wait_policy,
            "dependency_mode": self.dependency_mode,
            "failure_policy": self.failure_policy,
            "concurrency": self.concurrency,
        }
        if self.step_timeout_seconds is not None:
            data["step_timeout_seconds"] = self.step_timeout_seconds
        if self.force_new is not None:
            data["force_new"] = self.force_new
        return data


def _build_base_policy(
    raw_policy: Optional[Mapping[str, Any]],
    *,
    defaults: ExecutionPolicyV1,
) -> ExecutionPolicyV1:
    raw = dict(raw_policy or {})
    version = int(raw.get("version", defaults.version))
    if version != 1:
        raise ValueError(f"Unsupported execution_policy.version={version}; only v1 is supported")

    dispatch_mode = str(raw.get("dispatch_mode", defaults.dispatch_mode))
    wait_policy = str(raw.get("wait_policy", defaults.wait_policy))
    dependency_mode = str(raw.get("dependency_mode", defaults.dependency_mode))
    failure_policy = str(raw.get("failure_policy", defaults.failure_policy))
    concurrency = int(raw.get("concurrency", defaults.concurrency))

    step_timeout_raw = raw.get("step_timeout_seconds", defaults.step_timeout_seconds)
    step_timeout_seconds: Optional[float]
    if step_timeout_raw is None:
        step_timeout_seconds = None
    else:
        step_timeout_seconds = float(step_timeout_raw)
        if step_timeout_seconds <= 0:
            raise ValueError("execution_policy.step_timeout_seconds must be > 0")

    if "force_new" in raw:
        force_new = _as_bool(raw["force_new"])
    else:
        force_new = defaults.force_new

    return ExecutionPolicyV1(
        version=version,
        dispatch_mode=dispatch_mode,  # type: ignore[arg-type]
        wait_policy=wait_policy,  # type: ignore[arg-type]
        dependency_mode=dependency_mode,  # type: ignore[arg-type]
        failure_policy=failure_policy,  # type: ignore[arg-type]
        concurrency=concurrency,
        step_timeout_seconds=step_timeout_seconds,
        force_new=force_new,
    )


def normalize_chain_execution_policy(
    raw_policy: Optional[Mapping[str, Any]],
    *,
    legacy_step_timeout: Optional[float] = None,
) -> ExecutionPolicyV1:
    policy = _build_base_policy(
        raw_policy,
        defaults=ExecutionPolicyV1(
            version=1,
            dispatch_mode="sequential",
            wait_policy="terminal_per_step",
            dependency_mode="previous",
            failure_policy="stop",
            concurrency=1,
            step_timeout_seconds=legacy_step_timeout,
            force_new=None,
        ),
    )

    if policy.dispatch_mode != "sequential":
        raise ValueError("Chain execution requires execution_policy.dispatch_mode='sequential'")
    if policy.wait_policy != "terminal_per_step":
        raise ValueError("Chain execution currently supports wait_policy='terminal_per_step' only")
    if policy.dependency_mode not in {"previous", "explicit"}:
        raise ValueError("Chain execution requires dependency_mode='previous' or 'explicit'")
    if policy.failure_policy != "stop":
        raise ValueError("Chain execution currently supports failure_policy='stop' only")
    if policy.concurrency != 1:
        raise ValueError("Chain execution currently supports concurrency=1 only")
    return policy


def normalize_fanout_execution_policy(
    raw_policy: Optional[Mapping[str, Any]],
    *,
    legacy_continue_on_error: bool = True,
    legacy_force_new: bool = True,
) -> ExecutionPolicyV1:
    policy = _build_base_policy(
        raw_policy,
        defaults=ExecutionPolicyV1(
            version=1,
            dispatch_mode="fanout",
            wait_policy="none",
            dependency_mode="none",
            failure_policy="continue" if legacy_continue_on_error else "stop",
            concurrency=1,
            step_timeout_seconds=None,
            force_new=legacy_force_new,
        ),
    )

    if policy.dispatch_mode != "fanout":
        raise ValueError("Fanout execution requires execution_policy.dispatch_mode='fanout'")
    if policy.wait_policy != "none":
        raise ValueError("Fanout execution currently supports wait_policy='none' only")
    if policy.dependency_mode != "none":
        raise ValueError("Fanout execution requires dependency_mode='none'")
    if policy.failure_policy not in {"stop", "continue"}:
        raise ValueError("Fanout execution failure_policy must be 'stop' or 'continue'")
    if policy.concurrency != 1:
        raise ValueError("Fanout execution currently supports concurrency=1 only")
    if policy.step_timeout_seconds is not None:
        raise ValueError("Fanout execution does not support step_timeout_seconds")
    return policy


def normalize_item_execution_policy(
    raw_policy: Optional[Mapping[str, Any]],
    *,
    legacy_continue_on_error: bool = True,
    legacy_force_new: bool = True,
) -> ExecutionPolicyV1:
    """
    Normalize execution policy for raw-item orchestration endpoints.

    Supports:
    - fanout: independent submissions, no waiting, no dependencies
    - sequential: submit/wait one-by-one, optional dependency_mode='previous'
    """
    policy = _build_base_policy(
        raw_policy,
        defaults=ExecutionPolicyV1(
            version=1,
            dispatch_mode="fanout",
            wait_policy="none",
            dependency_mode="none",
            failure_policy="continue" if legacy_continue_on_error else "stop",
            concurrency=1,
            step_timeout_seconds=None,
            force_new=legacy_force_new,
        ),
    )

    if policy.dispatch_mode == "fanout":
        return normalize_fanout_execution_policy(
            policy.to_metadata(),
            legacy_continue_on_error=legacy_continue_on_error,
            legacy_force_new=legacy_force_new,
        )

    if policy.dispatch_mode != "sequential":
        raise ValueError("Raw item execution requires dispatch_mode='fanout' or 'sequential'")

    if policy.wait_policy != "terminal_per_step":
        raise ValueError("Sequential raw item execution requires wait_policy='terminal_per_step'")
    if policy.dependency_mode not in {"none", "previous"}:
        raise ValueError("Sequential raw item execution requires dependency_mode='none' or 'previous'")
    if policy.failure_policy not in {"stop", "continue"}:
        raise ValueError("Sequential raw item execution failure_policy must be 'stop' or 'continue'")
    if policy.concurrency != 1:
        raise ValueError("Sequential raw item execution currently supports concurrency=1 only")
    return policy
