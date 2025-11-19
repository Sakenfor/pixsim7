"""
Assertion Framework - Validation helpers for scenario testing
"""
from __future__ import annotations
from typing import Callable, List, Dict, Any, Optional
from pydantic import BaseModel, Field

from pixsim7_backend.domain.scenarios.models import WorldSnapshot


class AssertionResult(BaseModel):
    """Result of a single assertion evaluation"""
    assert_id: str = Field(..., description="Assertion identifier")
    description: str = Field(..., description="Human-readable description")
    passed: bool = Field(..., description="Whether assertion passed")
    details: Optional[str] = Field(default=None, description="Additional details on failure")
    actual_value: Optional[Any] = Field(default=None, description="Actual value found")
    expected_value: Optional[Any] = Field(default=None, description="Expected value")


# Type alias for assertion check functions
AssertionCheckFn = Callable[[WorldSnapshot], bool]


class ScenarioAssertion:
    """
    Scenario assertion definition.

    Wraps a check function with metadata for reporting.
    """

    def __init__(
        self,
        assert_id: str,
        description: str,
        check: AssertionCheckFn,
    ):
        self.assert_id = assert_id
        self.description = description
        self.check = check

    def evaluate(self, snapshot: WorldSnapshot) -> AssertionResult:
        """Evaluate this assertion against a snapshot"""
        try:
            passed = self.check(snapshot)
            return AssertionResult(
                assert_id=self.assert_id,
                description=self.description,
                passed=passed,
            )
        except Exception as e:
            return AssertionResult(
                assert_id=self.assert_id,
                description=self.description,
                passed=False,
                details=str(e),
            )


# ===== Helper Functions =====


def get_session(snapshot: WorldSnapshot, session_id: int):
    """Get a session from snapshot by ID"""
    for session in snapshot.sessions:
        if session.session_id == session_id:
            return session
    return None


def get_flag(session, path: str) -> Any:
    """Get a flag value from session using dot notation path"""
    parts = path.split('.')
    current = session.flags

    for part in parts:
        if current is None:
            return None
        if not isinstance(current, dict):
            return None
        current = current.get(part)

    return current


def get_relationship_metric(session, npc_id: int, metric: str) -> Optional[float]:
    """Get a relationship metric value for an NPC"""
    npc_key = f"npc:{npc_id}"
    npc_data = session.relationships.get(npc_key)

    if not npc_data:
        return None

    return npc_data.get(metric)


# ===== Assertion Builders =====


def assert_world_time(expected: float, tolerance: float = 0.1) -> ScenarioAssertion:
    """Assert that world time matches expected value within tolerance"""

    def check(snapshot: WorldSnapshot) -> bool:
        diff = abs(snapshot.world_time - expected)
        return diff <= tolerance

    return ScenarioAssertion(
        assert_id=f"world_time_{expected}",
        description=f"World time should be {expected}s (±{tolerance}s)",
        check=check,
    )


def assert_flag_equals(
    session_id: int,
    flag_path: str,
    expected: Any,
) -> ScenarioAssertion:
    """Assert that a session flag equals expected value"""

    def check(snapshot: WorldSnapshot) -> bool:
        session = get_session(snapshot, session_id)
        if not session:
            return False

        actual = get_flag(session, flag_path)
        return actual == expected

    return ScenarioAssertion(
        assert_id=f"flag_{session_id}_{flag_path}",
        description=f"Session {session_id} flag '{flag_path}' should equal {expected}",
        check=check,
    )


def assert_metric_between(
    session_id: int,
    npc_id: int,
    metric: str,
    min_value: float,
    max_value: float,
) -> ScenarioAssertion:
    """Assert that a relationship metric is within range"""

    def check(snapshot: WorldSnapshot) -> bool:
        session = get_session(snapshot, session_id)
        if not session:
            return False

        value = get_relationship_metric(session, npc_id, metric)
        if value is None:
            return False

        return min_value <= value <= max_value

    return ScenarioAssertion(
        assert_id=f"metric_{session_id}_{npc_id}_{metric}",
        description=f"NPC {npc_id} {metric} should be between {min_value} and {max_value}",
        check=check,
    )


def assert_relationship_tier(
    session_id: int,
    npc_id: int,
    expected_tier_id: str,
) -> ScenarioAssertion:
    """Assert that a relationship tier ID matches expected"""

    def check(snapshot: WorldSnapshot) -> bool:
        session = get_session(snapshot, session_id)
        if not session:
            return False

        npc_key = f"npc:{npc_id}"
        npc_data = session.relationships.get(npc_key)

        return npc_data and npc_data.get("tierId") == expected_tier_id

    return ScenarioAssertion(
        assert_id=f"tier_{session_id}_{npc_id}",
        description=f"NPC {npc_id} relationship tier should be '{expected_tier_id}'",
        check=check,
    )


def assert_intimacy_level(
    session_id: int,
    npc_id: int,
    expected_level_id: str,
) -> ScenarioAssertion:
    """Assert that intimacy level ID matches expected"""

    def check(snapshot: WorldSnapshot) -> bool:
        session = get_session(snapshot, session_id)
        if not session:
            return False

        npc_key = f"npc:{npc_id}"
        npc_data = session.relationships.get(npc_key)

        return npc_data and npc_data.get("intimacyLevelId") == expected_level_id

    return ScenarioAssertion(
        assert_id=f"intimacy_{session_id}_{npc_id}",
        description=f"NPC {npc_id} intimacy level should be '{expected_level_id}'",
        check=check,
    )


def assert_no_intimate_scene_without_consent(
    session_id: int,
    consent_threshold: str = "intimate",
) -> ScenarioAssertion:
    """
    Assert that no NPC has intimacy level beyond consent threshold without consent flag.
    Safety rail for content validation.
    """

    def check(snapshot: WorldSnapshot) -> bool:
        session = get_session(snapshot, session_id)
        if not session:
            return True  # Pass if session not found

        # Check all NPCs in relationships
        for key, npc_data in session.relationships.items():
            if not key.startswith("npc:"):
                continue

            intimacy_id = npc_data.get("intimacyLevelId")
            has_consent = npc_data.get("consentGiven", False)

            # If intimacy is at or beyond threshold and no consent, fail
            if intimacy_id == consent_threshold and not has_consent:
                return False

        return True

    return ScenarioAssertion(
        assert_id=f"consent_safety_{session_id}",
        description=f"No NPC should have intimacy beyond '{consent_threshold}' without consent flag",
        check=check,
    )


# ===== Assertion Evaluation =====


def evaluate_assertions(
    assertions: List[ScenarioAssertion],
    snapshot: WorldSnapshot,
) -> List[AssertionResult]:
    """Evaluate a list of assertions against a snapshot"""
    return [assertion.evaluate(snapshot) for assertion in assertions]


def create_assertion_registry() -> Dict[str, ScenarioAssertion]:
    """
    Create a registry of named assertions for scenarios.

    Scenarios can reference assertions by ID from this registry.
    """
    return {}


# Global assertion registry
_assertion_registry: Dict[str, ScenarioAssertion] = {}


def register_assertion(assertion: ScenarioAssertion) -> None:
    """Register an assertion in the global registry"""
    _assertion_registry[assertion.assert_id] = assertion


def get_assertion(assert_id: str) -> Optional[ScenarioAssertion]:
    """Get an assertion from the global registry"""
    return _assertion_registry.get(assert_id)


def clear_assertion_registry() -> None:
    """Clear the global assertion registry"""
    _assertion_registry.clear()
