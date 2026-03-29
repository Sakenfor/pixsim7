from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import literal, select

from pixsim7.backend.main.services.asset.core import AssetCoreService


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RowsResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


@pytest.mark.asyncio
async def test_similar_to_embedding_lookup_is_scoped_to_current_user() -> None:
    service = AssetCoreService(db=MagicMock(), user_service=MagicMock())
    service._build_asset_search_query = MagicMock(return_value=select(literal(1)))

    executed_statements: list[object] = []

    async def _execute_side_effect(statement):
        executed_statements.append(statement)
        if len(executed_statements) == 1:
            return _ScalarResult([0.0] * 768)
        return _RowsResult([])

    service.db.execute = AsyncMock(side_effect=_execute_side_effect)

    user = MagicMock()
    user.id = 42
    user.is_admin.return_value = False

    await service.list_assets(user=user, similar_to=99, limit=5)

    assert executed_statements, "expected at least one DB statement"
    first_statement_sql = str(executed_statements[0])
    assert "assets.id" in first_statement_sql
    assert "assets.user_id" in first_statement_sql
