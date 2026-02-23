"""API tests for server-side block template rolling via config.run_context."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

try:
    import httpx
    from fastapi import FastAPI

    from pixsim7.backend.main.api.dependencies import (
        get_current_user,
        get_generation_gateway,
    )
    from pixsim7.backend.main.api.v1 import generations as generations_api
    from pixsim7.backend.main.api.v1.generations import router
    from pixsim7.backend.main.domain.user import User

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


def _mock_user(user_id: int = 42):
    user = MagicMock(spec=User)
    user.id = user_id
    user.is_admin = MagicMock(return_value=False)
    return user


def _client(app: FastAPI):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def _fake_generation_response(*, user_id: int = 42):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=123,
        user_id=user_id,
        workspace_id=None,
        operation_type="text_to_video",
        provider_id="pixverse",
        raw_params={},
        canonical_params={},
        latest_submission_payload=None,
        inputs=[],
        reproducible_hash=None,
        prompt_version_id=None,
        final_prompt="rolled prompt from template",
        prompt_config=None,
        prompt_source_type="inline",
        status="pending",
        priority=5,
        scheduled_at=None,
        started_at=None,
        completed_at=None,
        error_message=None,
        error_code=None,
        retry_count=0,
        parent_generation_id=None,
        asset_id=None,
        account_id=None,
        account_email=None,
        name="Quick generation",
        description=None,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCreateGenerationTemplateRollViaRunContext:
    @pytest.mark.asyncio
    async def test_rolls_template_from_run_context_and_persists_roll_metadata(self, monkeypatch):
        user_id = 42
        template_id = str(uuid4())
        selected_block_ids = [uuid4(), uuid4()]
        character_bindings = {"hero": "character:1"}

        local_service = SimpleNamespace(
            db=SimpleNamespace(),
            create_generation=AsyncMock(return_value=_fake_generation_response(user_id=user_id)),
        )
        gateway = SimpleNamespace(
            proxy=AsyncMock(return_value=SimpleNamespace(called=False, data=None)),
            local=local_service,
        )

        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: _mock_user(user_id)
        app.dependency_overrides[get_generation_gateway] = lambda: gateway

        monkeypatch.setattr(generations_api, "get_client_identifier", AsyncMock(return_value="test-client"))
        monkeypatch.setattr(generations_api.job_create_limiter, "check", AsyncMock())

        roll_template_mock = AsyncMock(
            return_value={
                "success": True,
                "assembled_prompt": "rolled prompt from template",
                "metadata": {
                    "seed": 98765,
                    "selected_block_ids": selected_block_ids,
                },
            }
        )

        class _TemplateServiceStub:
            def __init__(self, db):
                self.db = db

            async def roll_template(self, template_id_arg, *, seed=None, exclude_block_ids=None, character_bindings=None):
                return await roll_template_mock(
                    template_id_arg,
                    seed=seed,
                    exclude_block_ids=exclude_block_ids,
                    character_bindings=character_bindings,
                )

        request_payload = {
            "config": {
                "generationType": "text_to_video",
                "purpose": "gap_fill",
                "style": {},
                "duration": {},
                "constraints": {},
                "strategy": "once",
                "fallback": {"mode": "skip"},
                "enabled": True,
                "version": 1,
                "prompt": "client prompt before roll",
                "run_context": {
                    "mode": "quickgen_burst",
                    "run_id": "run-abc",
                    "item_index": 0,
                    "item_total": 2,
                    "block_template_id": template_id,
                    "character_bindings": character_bindings,
                },
            },
            "provider_id": "pixverse",
            "priority": 5,
        }

        with patch(
            "pixsim7.backend.main.services.prompt.block.template_service.BlockTemplateService",
            _TemplateServiceStub,
        ):
            async with _client(app) as c:
                response = await c.post("/api/v1/generations", json=request_payload)

        assert response.status_code == 201, response.text
        generations_api.job_create_limiter.check.assert_awaited_once()
        generations_api.get_client_identifier.assert_awaited_once()
        gateway.proxy.assert_awaited_once()

        roll_template_mock.assert_awaited_once()
        roll_call = roll_template_mock.await_args
        assert str(roll_call.args[0]) == template_id
        assert roll_call.kwargs["character_bindings"] == character_bindings

        create_call = local_service.create_generation.await_args
        params = create_call.kwargs["params"]
        generation_config = params["generation_config"]

        assert generation_config["prompt"] == "rolled prompt from template"
        run_context = generation_config["run_context"]
        assert run_context["block_template_id"] == template_id
        assert run_context["character_bindings"] == character_bindings
        assert run_context["roll_seed"] == 98765
        assert run_context["selected_block_ids"] == [str(v) for v in selected_block_ids]
        assert run_context["assembled_prompt"] == "rolled prompt from template"
