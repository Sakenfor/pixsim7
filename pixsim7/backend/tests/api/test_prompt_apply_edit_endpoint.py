"""Prompt apply-edit endpoint tests."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.prompts.operations as operations_module
from pixsim7.backend.main.api.v1.prompts.operations import (
    ApplyPromptEditRequest,
    PromptEditOp,
    apply_prompt_edit,
)


@pytest.mark.asyncio
async def test_apply_prompt_edit_returns_404_when_source_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Service:
        def __init__(self, db) -> None:
            self.db = db

        async def get_version(self, version_id):  # noqa: ANN001
            return None

    monkeypatch.setattr(operations_module, "PromptVersionService", _Service)

    with pytest.raises(HTTPException) as exc:
        await apply_prompt_edit(
            version_id=uuid4(),
            request=ApplyPromptEditRequest(prompt_text="updated prompt"),
            db=object(),
            user=SimpleNamespace(email="agent@local"),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_apply_prompt_edit_returns_422_when_source_has_no_family(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_version = SimpleNamespace(
        id=uuid4(),
        family_id=None,
        tags=["mode:scene_setup"],
        variables={},
        provider_hints={},
    )

    class _Service:
        def __init__(self, db) -> None:
            self.db = db

        async def get_version(self, version_id):  # noqa: ANN001
            return source_version

    monkeypatch.setattr(operations_module, "PromptVersionService", _Service)

    with pytest.raises(HTTPException) as exc:
        await apply_prompt_edit(
            version_id=source_version.id,
            request=ApplyPromptEditRequest(prompt_text="updated prompt"),
            db=object(),
            user=SimpleNamespace(email="agent@local"),
        )

    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_apply_prompt_edit_creates_child_version_and_persists_authoring_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source_version = SimpleNamespace(
        id=uuid4(),
        family_id=uuid4(),
        tags=["sequence:initial", "intent:setup"],
        variables={"camera": "wide"},
        provider_hints={"quality": "high"},
    )

    created_version = SimpleNamespace(
        id=uuid4(),
        family_id=source_version.family_id,
        version_number=2,
        prompt_text="updated prose prompt",
        commit_message="Apply edit: less detail, more brass",
        author="agent@local",
        generation_count=0,
        successful_assets=0,
        tags=["sequence:initial", "intent:setup"],
        created_at=datetime.now(timezone.utc),
    )

    captured: dict = {}

    class _Service:
        def __init__(self, db) -> None:
            self.db = db

        async def get_version(self, version_id):  # noqa: ANN001
            return source_version

        async def create_version(self, **kwargs):  # noqa: ANN003
            captured.update(kwargs)
            return created_version

    monkeypatch.setattr(operations_module, "PromptVersionService", _Service)

    response = await apply_prompt_edit(
        version_id=source_version.id,
        request=ApplyPromptEditRequest(
            prompt_text="updated prose prompt",
            instruction="less detail, more brass",
            edit_ops=[
                PromptEditOp(
                    intent="modify",
                    target="vehicle.interior.detail",
                    direction="decrease",
                ),
                PromptEditOp(
                    intent="add",
                    target="vehicle.material.brass",
                    direction="increase",
                ),
            ],
        ),
        db=object(),
        user=SimpleNamespace(email="agent@local"),
    )

    assert captured["family_id"] == source_version.family_id
    assert captured["parent_version_id"] == source_version.id
    assert captured["tags"] == source_version.tags
    assert captured["variables"] == source_version.variables
    assert captured["provider_hints"] == source_version.provider_hints

    authoring_history = captured["prompt_analysis"]["authoring"]["history"]
    assert len(authoring_history) == 1
    assert authoring_history[0]["instruction"] == "less detail, more brass"
    assert authoring_history[0]["edit_ops"][0]["intent"] == "modify"

    assert response.source_version_id == source_version.id
    assert response.created_version.id == created_version.id
    assert response.applied_edit["commit_message"].startswith("Apply edit:")
