"""API tests for per-category notification preference writes.

`PATCH /notifications/categories/{category_id}` (notification-system
Phase 3 s1) is the per-category-safe mute path. The invariants that
matter and aren't obvious from the handler in isolation:

* It merges ONLY the targeted category — sibling category prefs and
  every other preference subtree (devtools, analyzer, …) survive. The
  generic `PATCH /users/me/preferences` merges at the top level, so a
  partial `notifications` map there would clobber the rest.
* Category id is alias-normalized ("plans" → "plan") and the
  granularity is validated against that category's own option set.
* `_get_user_muted_categories` reports only USER-explicit 'off' — never
  the registry default-off (e.g. `chat`). That distinction is the seam
  Phase 4a s5 consumes so the chat pip keeps ignoring chat's default-off
  while respecting an explicit user mute.
"""

from __future__ import annotations

TEST_SUITE = {
    "id": "notifications-category-prefs",
    "label": "Notifications Category Preference Writes",
    "kind": "contract",
    "category": "backend/api",
    "subcategory": "notifications-prefs",
    "covers": [
        "pixsim7/backend/main/api/v1/notifications.py",
    ],
    "order": 27.5,
}

from types import SimpleNamespace

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_user_service,
    )
    from pixsim7.backend.main.api.v1.notifications import (
        _get_user_muted_categories,
        _get_user_notification_prefs,
        router,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not IMPORTS_AVAILABLE, reason="backend deps not available"
)


class _UserServiceStub:
    """Captures the preferences blob the endpoint persists."""

    def __init__(self) -> None:
        self.saved_preferences: dict | None = None

    async def update_user(self, user_id: int, **updates):
        self.saved_preferences = updates.get("preferences")
        return SimpleNamespace(id=user_id, preferences=self.saved_preferences)


def _app(*, preferences: dict | None, svc: _UserServiceStub) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=1,
        username="notif-user",
        display_name="Notif User",
        preferences=preferences,
    )
    app.dependency_overrides[get_user_service] = lambda: svc
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


class TestSetCategoryPreference:
    @pytest.mark.asyncio
    async def test_mute_returns_updated_effective_granularity(self):
        svc = _UserServiceStub()
        app = _app(preferences=None, svc=svc)
        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/notifications/categories/chat",
                json={"granularity": "off"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "chat"
        assert body["currentGranularity"] == "off"
        assert svc.saved_preferences == {
            "notifications": {"chat": {"granularity": "off"}}
        }

    @pytest.mark.asyncio
    async def test_per_category_merge_preserves_siblings_and_other_subtrees(self):
        """Muting one category must not wipe other prefs."""
        svc = _UserServiceStub()
        app = _app(
            preferences={
                "notifications": {
                    "generation": {"granularity": "failures_only"},
                },
                "devtools": {"someFlag": True},
            },
            svc=svc,
        )
        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/notifications/categories/chat",
                json={"granularity": "off"},
            )
        assert resp.status_code == 200
        # Sibling category pref + unrelated subtree both survive.
        assert svc.saved_preferences == {
            "notifications": {
                "generation": {"granularity": "failures_only"},
                "chat": {"granularity": "off"},
            },
            "devtools": {"someFlag": True},
        }

    @pytest.mark.asyncio
    async def test_category_alias_is_normalized(self):
        svc = _UserServiceStub()
        app = _app(preferences=None, svc=svc)
        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/notifications/categories/plans",  # alias of "plan"
                json={"granularity": "off"},
            )
        assert resp.status_code == 200
        assert resp.json()["id"] == "plan"
        assert svc.saved_preferences == {
            "notifications": {"plan": {"granularity": "off"}}
        }

    @pytest.mark.asyncio
    async def test_unknown_category_is_404(self):
        svc = _UserServiceStub()
        app = _app(preferences=None, svc=svc)
        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/notifications/categories/not-a-real-category",
                json={"granularity": "off"},
            )
        assert resp.status_code == 404
        assert svc.saved_preferences is None  # nothing persisted

    @pytest.mark.asyncio
    async def test_invalid_granularity_for_category_is_400(self):
        # `chat` only offers all/off — failures_only is not valid for it.
        svc = _UserServiceStub()
        app = _app(preferences=None, svc=svc)
        async with _client(app) as c:
            resp = await c.patch(
                "/api/v1/notifications/categories/chat",
                json={"granularity": "failures_only"},
            )
        assert resp.status_code == 400
        assert svc.saved_preferences is None


class TestUserMutedCategoriesSeam:
    def test_only_user_explicit_off_not_registry_default_off(self):
        # `chat` is registry default_enabled=False, but this user has NOT
        # set it explicitly -> it must NOT count as a user mute.
        user = SimpleNamespace(
            preferences={
                "notifications": {
                    "plan": {"granularity": "all"},
                }
            }
        )
        assert _get_user_muted_categories(user) == set()

    def test_includes_user_explicit_off(self):
        user = SimpleNamespace(
            preferences={
                "notifications": {
                    "chat": {"granularity": "off"},
                    "plan": {"granularity": "all"},
                    "generation": {"granularity": "failures_only"},
                }
            }
        )
        assert _get_user_muted_categories(user) == {"chat"}

    def test_empty_when_no_prefs(self):
        assert _get_user_muted_categories(SimpleNamespace(preferences=None)) == set()

    def test_accepts_precomputed_prefs(self):
        user = SimpleNamespace(
            preferences={"notifications": {"plan": {"granularity": "off"}}}
        )
        prefs = _get_user_notification_prefs(user)
        assert _get_user_muted_categories(user, user_prefs=prefs) == {"plan"}
