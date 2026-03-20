"""Tests for structured notification write policy enforcement.

Validates:
- All writes go through emit_notification() with a required event_type
- Known event types are validated (payload fields, ref_type)
- Legacy endpoint stamps event_type='notification.manual'
- Event type registry contains expected built-in types
- No legacy writers remain (all paths set event_type)
"""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-structured-migration",
    "label": "Structured Notification Write Policy Tests",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "notifications-structured",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
        "pixsim7/backend/main/services/notifications/notification_categories.py",
        "pixsim7/backend/main/services/meta/contract_registry.py",
    ],
    "order": 27,
}

import ast
import inspect
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import get_current_user, get_database
    from pixsim7.backend.main.api.v1.notifications import (
        emit_notification,
        router,
    )
    from pixsim7.backend.main.domain.platform.notification import Notification
    from pixsim7.backend.main.services.notifications.notification_categories import (
        notification_event_type_registry,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# ── Stubs ────────────────────────────────────────────────────────


@dataclass
class _DbStub:
    added: List[Any] = field(default_factory=list)
    commits: int = 0

    def add(self, item: Any) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1


def _app(db_stub: _DbStub) -> "FastAPI":
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _db():
        yield db_stub

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1,
        username="test-user",
        display_name="Test User",
        preferences={},
    )
    return app


def _client(app: "FastAPI"):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ── Event type registry ─────────────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestEventTypeRegistry:
    def test_builtin_event_types_registered(self):
        for event_id in ("plan.created", "plan.updated", "notification.manual"):
            spec = notification_event_type_registry.get_or_none(event_id)
            assert spec is not None, f"{event_id} not registered"
            assert spec.id == event_id

    def test_plan_created_requires_plan_title(self):
        err = notification_event_type_registry.validate_payload(
            "plan.created", {}
        )
        assert err is not None
        assert "planTitle" in err

    def test_plan_created_valid_payload(self):
        err = notification_event_type_registry.validate_payload(
            "plan.created", {"planTitle": "Test Plan"}
        )
        assert err is None

    def test_plan_updated_requires_changes(self):
        err = notification_event_type_registry.validate_payload(
            "plan.updated", {"planTitle": "Test Plan"}
        )
        assert err is not None
        assert "changes" in err

    def test_plan_updated_valid_payload(self):
        err = notification_event_type_registry.validate_payload(
            "plan.updated", {"changes": [{"field": "status", "old": "a", "new": "b"}]}
        )
        assert err is None

    def test_notification_manual_has_no_required_fields(self):
        err = notification_event_type_registry.validate_payload(
            "notification.manual", {}
        )
        assert err is None

    def test_unknown_event_skips_validation(self):
        err = notification_event_type_registry.validate_payload(
            "custom.unknown.event", {}
        )
        assert err is None

    def test_default_category_for_plan_created(self):
        cat = notification_event_type_registry.default_category_for_event(
            "plan.created", {"planTitle": "X"}
        )
        assert cat == "plan.created"

    def test_default_category_for_plan_updated_routes_to_subcategory(self):
        cat = notification_event_type_registry.default_category_for_event(
            "plan.updated",
            {"changes": [{"field": "status", "old": "a", "new": "b"}]},
        )
        assert cat == "plan.status"

    def test_default_severity_for_known_events(self):
        assert notification_event_type_registry.default_severity_for_event("plan.created") == "success"
        assert notification_event_type_registry.default_severity_for_event("plan.updated") == "info"
        assert notification_event_type_registry.default_severity_for_event("unknown") == "info"


# ── emit_notification() requires event_type ──────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestEmitNotificationPolicy:
    def test_event_type_is_required_parameter(self):
        sig = inspect.signature(emit_notification)
        param = sig.parameters["event_type"]
        assert param.default is inspect.Parameter.empty, (
            "event_type must be a required parameter (no default)"
        )

    @pytest.mark.asyncio
    async def test_emit_validates_known_event_payload(self):
        db_stub = _DbStub()
        with pytest.raises(ValueError, match="planTitle"):
            await emit_notification(
                db_stub,
                title="Plan created: X",
                event_type="plan.created",
                payload={},
            )

    @pytest.mark.asyncio
    async def test_emit_succeeds_with_valid_payload(self):
        db_stub = _DbStub()
        n = await emit_notification(
            db_stub,
            title="Plan created: X",
            event_type="plan.created",
            ref_type="plan",
            ref_id="plan-x",
            payload={"planTitle": "X"},
        )
        assert n.event_type == "plan.created"
        assert n.payload == {"planTitle": "X"}
        assert len(db_stub.added) == 1

    @pytest.mark.asyncio
    async def test_emit_allows_unknown_event_types(self):
        db_stub = _DbStub()
        n = await emit_notification(
            db_stub,
            title="Custom event",
            event_type="custom.my_feature",
            payload={"detail": "hello"},
        )
        assert n.event_type == "custom.my_feature"

    @pytest.mark.asyncio
    async def test_emit_sets_empty_payload_when_none_given(self):
        db_stub = _DbStub()
        n = await emit_notification(
            db_stub,
            title="Manual",
            event_type="notification.manual",
        )
        assert n.payload == {}


# ── Legacy endpoint stamps event_type ────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestLegacyEndpointMigrated:
    @pytest.mark.asyncio
    async def test_legacy_create_stamps_event_type(self):
        db_stub = _DbStub()
        app = _app(db_stub)

        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/notifications",
                json={"title": "Manual note", "body": "Test body"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["eventType"] == "notification.manual"
        assert db_stub.commits == 1

        row = db_stub.added[0]
        assert row.event_type == "notification.manual"
        assert isinstance(row.payload, dict)

    @pytest.mark.asyncio
    async def test_legacy_endpoint_preserves_category_severity(self):
        db_stub = _DbStub()
        app = _app(db_stub)

        async with _client(app) as c:
            resp = await c.post(
                "/api/v1/notifications",
                json={
                    "title": "Warning",
                    "category": "feature",
                    "severity": "warning",
                },
            )

        assert resp.status_code == 200
        row = db_stub.added[0]
        assert row.category == "feature"
        assert row.severity == "warning"
        assert row.event_type == "notification.manual"


# ── Contract surface ─────────────────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestContractSurface:
    @pytest.mark.asyncio
    async def test_contracts_index_includes_structured_write_policy(self):
        from pixsim7.backend.main.api.v1.meta_contracts import list_contract_endpoints

        result = await list_contract_endpoints()
        notifications = next(
            (c for c in result.contracts if c.id == "notifications"), None
        )
        assert notifications is not None
        assert "notification_structured_write_policy" in notifications.provides
        assert "notification_structured_emit" in notifications.provides

    @pytest.mark.asyncio
    async def test_legacy_endpoint_tagged_deprecated(self):
        from pixsim7.backend.main.api.v1.meta_contracts import list_contract_endpoints

        result = await list_contract_endpoints()
        notifications = next(
            (c for c in result.contracts if c.id == "notifications"), None
        )
        assert notifications is not None
        endpoints = {ep.id: ep for ep in notifications.sub_endpoints}
        create_ep = endpoints["notifications.create"]
        assert "deprecated" in create_ep.tags


# ── No remaining legacy writers ──────────────────────────────────


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestNoLegacyWriters:
    """Verify that no backend code creates Notification() directly without event_type."""

    def test_all_notification_model_creations_have_event_type(self):
        """Parse notifications.py AST and check all Notification() calls include event_type."""
        import pixsim7.backend.main.api.v1.notifications as mod

        source = inspect.getsource(mod)
        tree = ast.parse(source)

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            # Match Notification(...) calls
            func = node.func
            if isinstance(func, ast.Name) and func.id == "Notification":
                kw_names = {kw.arg for kw in node.keywords if kw.arg is not None}
                assert "event_type" in kw_names, (
                    f"Notification() call at line {node.lineno} missing event_type keyword"
                )

    def test_emit_notification_always_sets_event_type(self):
        """The emit_notification() function requires event_type (verified via signature)."""
        sig = inspect.signature(emit_notification)
        param = sig.parameters["event_type"]
        assert param.default is inspect.Parameter.empty
