"""Unit tests for notification read-side rendering helpers."""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-rendering",
    "label": "Notification Rendering Helper Tests",
    "kind": "unit",
    "category": "backend/api",
    "subcategory": "notifications-rendering",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
    ],
    "order": 27.2,
}

import pytest

try:
    from pixsim7.backend.main.api.v1.notifications import (
        _normalize_category_id,
        _resolve_actor_user_id,
        _resolve_granularity,
        _to_response,
    )
    from pixsim7.backend.main.domain.platform.notification import Notification
    from pixsim7.backend.main.shared.schemas.user_schemas import NotificationCategoryPref

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestNotificationRendering:
    def test_created_event_uses_live_actor_and_current_plan_title(self) -> None:
        notification = Notification(
            title="Plan created: Legacy title",
            body="New plan: **Legacy title**",
            category="plan.created",
            severity="success",
            source="user:9",
            event_type="plan.created",
            actor_name="Legacy User",
            actor_user_id=9,
            ref_type="plan",
            ref_id="plan-a",
            payload={"planTitle": "Legacy title"},
        )

        response = _to_response(
            notification,
            actor_names={9: "Current User"},
            plan_titles={"plan-a": "Current Plan"},
        )

        assert response["actorName"] == "Current User"
        assert response["title"] == "Plan created: Current Plan"
        assert response["body"] == "New plan: **Current Plan**"

    def test_updated_event_renders_body_from_structured_changes(self) -> None:
        notification = Notification(
            title="Plan updated: Legacy title",
            body=None,
            category="plan.status",
            severity="info",
            source="user:11",
            event_type="plan.updated",
            actor_name="Legacy User",
            actor_user_id=11,
            ref_type="plan",
            ref_id="plan-b",
            payload={
                "changes": [
                    {"field": "status", "old": "active", "new": "blocked"},
                    {"field": "owner", "old": "alice", "new": "bob"},
                ]
            },
        )

        response = _to_response(
            notification,
            actor_names={11: "Current User"},
            plan_titles={"plan-b": "Current Plan"},
        )

        assert response["title"] == "Plan updated: Current Plan"
        assert response["body"] == "**Current Plan**: status -> blocked, owner -> bob"
        assert response["actorName"] == "Current User"

    def test_actor_user_id_fallback_from_source(self) -> None:
        assert _resolve_actor_user_id("user:42", None) == 42
        assert _resolve_actor_user_id("user:not-a-number", None) is None
        assert _resolve_actor_user_id("system", None) is None

    def test_category_alias_normalization(self) -> None:
        assert _normalize_category_id("plans") == "plan"
        assert _normalize_category_id("PLANs") == "plan"
        assert _normalize_category_id("plan.created") == "plan.created"

    def test_unregistered_subcategory_inherits_parent_granularity(self) -> None:
        prefs = {"plan": NotificationCategoryPref(granularity="status_only")}
        assert _resolve_granularity("plan.custom_field", prefs) == "status_only"

        off_prefs = {"plan": NotificationCategoryPref(granularity="off")}
        assert _resolve_granularity("plan.custom_field", off_prefs) == "off"
