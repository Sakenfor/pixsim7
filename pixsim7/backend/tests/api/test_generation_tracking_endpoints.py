"""
API tests for generation tracking facade endpoints.

Covers:
- Asset tracking happy path
- Run tracking happy path with ordered items
- Generation tracking happy path
- Missing generation but existing manifest still returns data
- Unauthorized access returns 404
- Consistency warnings appear for mismatches
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_database,
        get_generation_gateway,
        get_generation_tracking_service,
    )
    from pixsim7.backend.main.api.v1.generations import router
    from pixsim7.backend.main.domain.user import User
    from pixsim7.backend.main.services.generation.tracking import GenerationTrackingService

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _mock_user(user_id: int = 42):
    user = MagicMock(spec=User)
    user.id = user_id
    user.is_admin = MagicMock(return_value=False)
    return user


def _gateway_stub(*, proxy_called: bool = False, proxy_data=None):
    return SimpleNamespace(
        proxy=AsyncMock(return_value=SimpleNamespace(called=proxy_called, data=proxy_data)),
        local=SimpleNamespace(),
    )


def _app(
    tracking_service,
    *,
    user_id: int = 42,
    gateway_proxy_called: bool = False,
    gateway_data=None,
):
    """Build a test FastAPI app with the tracking service injected."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: _mock_user(user_id)
    app.dependency_overrides[get_generation_gateway] = lambda: _gateway_stub(
        proxy_called=gateway_proxy_called,
        proxy_data=gateway_data,
    )
    app.dependency_overrides[get_generation_tracking_service] = lambda: tracking_service
    # Provide a dummy DB for other endpoints that need it
    app.dependency_overrides[get_database] = lambda: SimpleNamespace(execute=AsyncMock())
    return app


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ── Fixtures ──────────────────────────────────────────────────────────


def _make_asset_tracking_result(
    asset_id: int = 10,
    *,
    generation: dict | None = None,
    manifest: dict | None = None,
    submission: dict | None = None,
    warnings: list[str] | None = None,
):
    return {
        "asset_id": asset_id,
        "generation": generation,
        "manifest": manifest,
        "latest_submission": submission,
        "consistency_warnings": warnings or [],
    }


def _sample_generation_summary(gen_id: int = 100):
    return {
        "id": gen_id,
        "status": "completed",
        "operation_type": "text_to_video",
        "provider_id": "pixverse",
        "asset_id": 10,
        "priority": 5,
        "retry_count": 0,
        "error_message": None,
        "error_code": None,
        "final_prompt": "a sunset over mountains",
        "prompt_source_type": "inline",
        "created_at": "2026-02-21T12:00:00+00:00",
        "started_at": "2026-02-21T12:00:01+00:00",
        "completed_at": "2026-02-21T12:00:30+00:00",
        "duration_seconds": 29.0,
    }


def _sample_manifest_summary(asset_id: int = 10, batch_id: str | None = None):
    return {
        "asset_id": asset_id,
        "batch_id": batch_id or str(uuid4()),
        "item_index": 0,
        "generation_id": 100,
        "block_template_id": None,
        "template_slug": None,
        "roll_seed": None,
        "selected_block_ids": ["blk-1"],
        "slot_results": [{"slot_key": "subject", "selected": True}],
        "assembled_prompt": "a sunset over mountains",
        "prompt_version_id": None,
        "mode": "quickgen_each",
        "strategy": "each",
        "input_asset_ids": [1, 2],
        "created_at": "2026-02-21T12:00:00+00:00",
    }


def _sample_submission_summary(sub_id: int = 500):
    return {
        "submission_id": sub_id,
        "provider_id": "pixverse",
        "provider_job_id": "pv-job-abc",
        "retry_attempt": 0,
        "status": "success",
        "submitted_at": "2026-02-21T12:00:01+00:00",
        "responded_at": "2026-02-21T12:00:30+00:00",
        "duration_ms": 29000,
    }


# ===== ASSET TRACKING =====


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestAssetTrackingEndpoint:
    @pytest.mark.asyncio
    async def test_asset_tracking_happy_path(self):
        """Full asset tracking with generation, manifest, and submission."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_asset_tracking = AsyncMock(
            return_value=_make_asset_tracking_result(
                generation=_sample_generation_summary(),
                manifest=_sample_manifest_summary(),
                submission=_sample_submission_summary(),
            )
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/assets/10")

        assert response.status_code == 200
        payload = response.json()
        assert payload["asset_id"] == 10
        assert payload["generation"]["id"] == 100
        assert payload["generation"]["status"] == "completed"
        assert payload["manifest"]["batch_id"] is not None
        assert payload["manifest"]["mode"] == "quickgen_each"
        assert payload["latest_submission"]["submission_id"] == 500
        assert payload["latest_submission"]["provider_id"] == "pixverse"
        assert payload["consistency_warnings"] == []

    @pytest.mark.asyncio
    async def test_asset_tracking_uses_gateway_proxy_when_available(self):
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_asset_tracking = AsyncMock(return_value=None)
        proxy_data = _make_asset_tracking_result(
            generation=_sample_generation_summary(),
            manifest=_sample_manifest_summary(),
            submission=_sample_submission_summary(),
        )
        app = _app(
            tracking,
            gateway_proxy_called=True,
            gateway_data=proxy_data,
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/assets/10")

        assert response.status_code == 200
        payload = response.json()
        assert payload["asset_id"] == 10
        tracking.get_asset_tracking.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_asset_tracking_missing_generation_with_manifest(self):
        """Manifest exists but generation is missing — still returns data with warnings."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_asset_tracking = AsyncMock(
            return_value=_make_asset_tracking_result(
                generation=None,
                manifest=_sample_manifest_summary(),
                submission=None,
                warnings=["manifest.generation_id=100 references a missing generation row"],
            )
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/assets/10")

        assert response.status_code == 200
        payload = response.json()
        assert payload["generation"] is None
        assert payload["manifest"] is not None
        assert payload["latest_submission"] is None
        assert len(payload["consistency_warnings"]) == 1
        assert "missing generation" in payload["consistency_warnings"][0]

    @pytest.mark.asyncio
    async def test_asset_tracking_not_found(self):
        """Asset not found or not owned by user returns 404."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_asset_tracking = AsyncMock(return_value=None)
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/assets/999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_asset_tracking_consistency_warnings(self):
        """Asset tracking detects generation/manifest asset_id mismatch."""
        tracking = MagicMock(spec=GenerationTrackingService)
        gen = _sample_generation_summary()
        gen["asset_id"] = 99  # Mismatch
        tracking.get_asset_tracking = AsyncMock(
            return_value=_make_asset_tracking_result(
                generation=gen,
                manifest=_sample_manifest_summary(),
                warnings=["generation.asset_id=99 differs from manifest asset_id=10"],
            )
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/assets/10")

        assert response.status_code == 200
        payload = response.json()
        assert len(payload["consistency_warnings"]) == 1
        assert "differs" in payload["consistency_warnings"][0]


# ===== RUN TRACKING =====


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestRunTrackingEndpoint:
    @pytest.mark.asyncio
    async def test_run_tracking_happy_path(self):
        """Run tracking returns ordered items with generation and submission info."""
        run_id = uuid4()
        batch_id_str = str(run_id)

        items = []
        for i, asset_id in enumerate([10, 11, 12]):
            manifest = _sample_manifest_summary(asset_id=asset_id, batch_id=batch_id_str)
            manifest["item_index"] = i
            manifest["generation_id"] = 100 + i
            items.append({
                **manifest,
                "generation_status": "completed",
                "generation_provider_id": "pixverse",
                "generation_operation_type": "text_to_video",
                "latest_submission": _sample_submission_summary(sub_id=500 + i),
                "item_warnings": [],
            })

        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_run_tracking = AsyncMock(
            return_value={
                "run": {
                    "run_id": batch_id_str,
                    "item_count": 3,
                    "created_at": "2026-02-21T12:00:02+00:00",
                    "first_item_index": 0,
                    "last_item_index": 2,
                },
                "items": items,
                "consistency_warnings": [],
            }
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-tracking/runs/{run_id}")

        assert response.status_code == 200
        payload = response.json()
        assert payload["run"]["run_id"] == batch_id_str
        assert payload["run"]["item_count"] == 3
        assert payload["run"]["first_item_index"] == 0
        assert payload["run"]["last_item_index"] == 2
        assert len(payload["items"]) == 3
        assert payload["items"][0]["asset_id"] == 10
        assert payload["items"][0]["generation_status"] == "completed"
        assert payload["items"][2]["latest_submission"]["submission_id"] == 502
        assert payload["consistency_warnings"] == []

    @pytest.mark.asyncio
    async def test_run_tracking_uses_gateway_proxy_when_available(self):
        run_id = uuid4()
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_run_tracking = AsyncMock(return_value=None)
        proxy_data = {
            "run": {
                "run_id": str(run_id),
                "item_count": 0,
                "created_at": "2026-02-21T12:00:00+00:00",
                "first_item_index": 0,
                "last_item_index": 0,
            },
            "items": [],
            "consistency_warnings": [],
        }
        app = _app(
            tracking,
            gateway_proxy_called=True,
            gateway_data=proxy_data,
        )

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-tracking/runs/{run_id}")

        assert response.status_code == 200
        payload = response.json()
        assert payload["run"]["run_id"] == str(run_id)
        tracking.get_run_tracking.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_run_tracking_not_found(self):
        """Run not found returns 404."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_run_tracking = AsyncMock(return_value=None)
        app = _app(tracking)
        run_id = uuid4()

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-tracking/runs/{run_id}")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_run_tracking_with_item_warnings(self):
        """Run tracking includes item-level and run-level warnings."""
        run_id = uuid4()
        batch_id_str = str(run_id)
        manifest = _sample_manifest_summary(asset_id=10, batch_id=batch_id_str)
        manifest["item_index"] = 0

        item = {
            **manifest,
            "generation_status": None,
            "generation_provider_id": None,
            "generation_operation_type": None,
            "latest_submission": None,
            "item_warnings": [
                "manifest.generation_id=100 references a missing generation"
            ],
        }

        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_run_tracking = AsyncMock(
            return_value={
                "run": {
                    "run_id": batch_id_str,
                    "item_count": 1,
                    "created_at": "2026-02-21T12:00:00+00:00",
                    "first_item_index": 0,
                    "last_item_index": 0,
                },
                "items": [item],
                "consistency_warnings": [],
            }
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get(f"/api/v1/generation-tracking/runs/{run_id}")

        assert response.status_code == 200
        payload = response.json()
        assert len(payload["items"][0]["item_warnings"]) == 1
        assert "missing generation" in payload["items"][0]["item_warnings"][0]


# ===== GENERATION TRACKING =====


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestGenerationTrackingEndpoint:
    @pytest.mark.asyncio
    async def test_generation_tracking_happy_path(self):
        """Generation tracking returns generation + manifest + submission."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_generation_tracking = AsyncMock(
            return_value={
                "generation": _sample_generation_summary(),
                "manifest": _sample_manifest_summary(),
                "latest_submission": _sample_submission_summary(),
                "consistency_warnings": [],
            }
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/generations/100")

        assert response.status_code == 200
        payload = response.json()
        assert payload["generation"]["id"] == 100
        assert payload["generation"]["status"] == "completed"
        assert payload["manifest"]["asset_id"] == 10
        assert payload["latest_submission"]["provider_job_id"] == "pv-job-abc"
        assert payload["consistency_warnings"] == []

    @pytest.mark.asyncio
    async def test_generation_tracking_uses_gateway_proxy_when_available(self):
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_generation_tracking = AsyncMock(return_value=None)
        proxy_data = {
            "generation": _sample_generation_summary(),
            "manifest": _sample_manifest_summary(),
            "latest_submission": _sample_submission_summary(),
            "consistency_warnings": [],
        }
        app = _app(
            tracking,
            gateway_proxy_called=True,
            gateway_data=proxy_data,
        )

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/generations/100")

        assert response.status_code == 200
        payload = response.json()
        assert payload["generation"]["id"] == 100
        tracking.get_generation_tracking.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_generation_tracking_not_found(self):
        """Generation not found or unauthorized returns 404."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_generation_tracking = AsyncMock(return_value=None)
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/generations/999")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_generation_tracking_no_manifest(self):
        """Generation exists but has no manifest — still returns generation data."""
        tracking = MagicMock(spec=GenerationTrackingService)
        tracking.get_generation_tracking = AsyncMock(
            return_value={
                "generation": _sample_generation_summary(),
                "manifest": None,
                "latest_submission": _sample_submission_summary(),
                "consistency_warnings": [
                    "generation.asset_id=10 exists but no manifest found for that asset"
                ],
            }
        )
        app = _app(tracking)

        async with _client(app) as c:
            response = await c.get("/api/v1/generation-tracking/generations/100")

        assert response.status_code == 200
        payload = response.json()
        assert payload["generation"]["id"] == 100
        assert payload["manifest"] is None
        assert payload["latest_submission"] is not None
        assert len(payload["consistency_warnings"]) == 1
        assert "no manifest" in payload["consistency_warnings"][0]
