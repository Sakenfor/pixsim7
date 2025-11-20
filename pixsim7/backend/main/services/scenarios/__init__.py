"""
Scenarios service - snapshot capture/restore and scenario runner
"""
from .snapshot_service import SnapshotService
from .runner import ScenarioRunner, ScenarioResult, ScenarioStepResult
from .assertions import (
    ScenarioAssertion,
    AssertionResult,
    assert_world_time,
    assert_flag_equals,
    assert_metric_between,
    assert_relationship_tier,
    assert_intimacy_level,
    assert_no_intimate_scene_without_consent,
    evaluate_assertions,
    register_assertion,
    get_assertion,
    clear_assertion_registry,
)

__all__ = [
    "SnapshotService",
    "ScenarioRunner",
    "ScenarioResult",
    "ScenarioStepResult",
    "ScenarioAssertion",
    "AssertionResult",
    "assert_world_time",
    "assert_flag_equals",
    "assert_metric_between",
    "assert_relationship_tier",
    "assert_intimacy_level",
    "assert_no_intimate_scene_without_consent",
    "evaluate_assertions",
    "register_assertion",
    "get_assertion",
    "clear_assertion_registry",
]
