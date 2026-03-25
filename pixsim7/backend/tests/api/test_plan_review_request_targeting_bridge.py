"""Unit tests for review-request bridge UUID targeting resolution."""

from __future__ import annotations

import pytest

try:
    from fastapi import HTTPException
    from pydantic import ValidationError
    from pixsim7.backend.main.api.v1.plans.helpers import _resolve_review_request_targeting
    from pixsim7.backend.main.api.v1.plans.schemas import PlanRequestCreateRequest

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


pytestmark = pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="backend deps not available")


class TestPlanRequestBridgeTargeting:
    def test_session_target_bridge_busy_reroutes_to_idle(self):
        payload = PlanRequestCreateRequest(
            title="Busy bridge reroute",
            body="Route by bridge id",
            target_mode="session",
            target_bridge_id="bridge-busy",
            queue_if_busy=False,
            auto_reroute_if_busy=True,
        )
        live_agents = [
            {
                "bridge_id": "bridge-busy",
                "agent_id": "assistant:busy",
                "agent_type": "claude-cli",
                "busy": True,
                "active_tasks": 1,
                "tasks_completed": 9,
            },
            {
                "bridge_id": "bridge-idle",
                "agent_id": "assistant:idle",
                "agent_type": "claude-cli",
                "busy": False,
                "active_tasks": 0,
                "tasks_completed": 3,
            },
        ]

        dispatch = _resolve_review_request_targeting(
            payload=payload,
            live_agents=live_agents,
        )

        assert dispatch["target_mode"] == "session"
        assert dispatch["target_bridge_id"] == "bridge-idle"
        assert dispatch["target_agent_id"] == "assistant:idle"
        assert dispatch["target_session_id"] == "assistant:idle"
        assert dispatch["dispatch_state"] == "assigned"
        assert dispatch["dispatch_reason"] == "target_bridge_busy_rerouted"

    def test_session_target_bridge_missing_raises_when_no_reroute(self):
        payload = PlanRequestCreateRequest(
            title="Missing bridge",
            body="Do not reroute",
            target_mode="session",
            target_bridge_id="bridge-missing",
            queue_if_busy=False,
            auto_reroute_if_busy=False,
        )

        with pytest.raises(HTTPException) as excinfo:
            _resolve_review_request_targeting(payload=payload, live_agents=[])

        assert excinfo.value.status_code == 409
        assert "Target bridge 'bridge-missing' is not connected." in str(excinfo.value.detail)

    def test_patch_review_modes_require_base_revision(self):
        with pytest.raises(ValidationError):
            PlanRequestCreateRequest(
                title="Patch proposal",
                body="Please propose edits.",
                review_mode="propose_patch",
            )
        with pytest.raises(ValidationError):
            PlanRequestCreateRequest(
                title="Patch apply",
                body="Please apply edits.",
                review_mode="apply_patch",
            )

    def test_patch_review_modes_accept_base_revision(self):
        payload = PlanRequestCreateRequest(
            title="Patch proposal",
            body="Please propose edits.",
            review_mode="propose_patch",
            base_revision=7,
        )
        assert payload.review_mode == "propose_patch"
        assert payload.base_revision == 7
