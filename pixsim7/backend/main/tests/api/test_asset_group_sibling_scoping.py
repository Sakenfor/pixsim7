from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.api.v1.assets import (
    AssetGroupBy,
    AssetGroupRequest,
    list_asset_groups,
)
from pixsim7.backend.main.services.asset._search import AssetGroupResult


@pytest.mark.asyncio
async def test_sibling_meta_query_uses_scoped_asset_subquery() -> None:
    now = datetime.now(timezone.utc)
    groups = [
        AssetGroupResult(
            key="hash-abc",
            count=1,
            latest_created_at=now,
            preview_assets=[],
        )
    ]

    asset_service = MagicMock()
    asset_service.list_asset_groups = AsyncMock(return_value=(groups, 1))
    asset_service.build_group_meta_payloads = AsyncMock(
        return_value={
            "hash-abc": {
                "kind": "sibling",
                "hash": "hash-abc",
                "generation_id": 123,
                "provider_id": "pixverse",
                "operation_type": "text_to_image",
                "status": "completed",
                "created_at": now,
                "prompt_snippet": "A castle on a hill at sunset",
            }
        }
    )

    db = MagicMock()
    db.execute = AsyncMock()

    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False

    request = AssetGroupRequest(group_by=AssetGroupBy.sibling)

    response = await list_asset_groups(
        user=user,
        asset_service=asset_service,
        db=db,
        request=request,
    )

    asset_service.build_group_meta_payloads.assert_awaited_once()
    db.execute.assert_not_awaited()

    assert response.total == 1
    assert len(response.groups) == 1
    assert response.groups[0].meta is not None
    assert getattr(response.groups[0].meta, "kind", None) == "sibling"
    assert getattr(response.groups[0].meta, "hash", None) == "hash-abc"
