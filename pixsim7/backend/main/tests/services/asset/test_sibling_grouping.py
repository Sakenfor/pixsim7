"""Tests for sibling (reproducible_hash) grouping in AssetCoreService."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select, literal

from pixsim7.backend.main.services.asset.core import AssetCoreService


class TestResolveSiblingGroupKeyExpr:
    """Unit tests for _resolve_group_key_expr with group_by='sibling'."""

    def _make_service(self) -> AssetCoreService:
        return AssetCoreService(db=MagicMock(), user_service=MagicMock())

    def test_sibling_returns_valid_expr(self):
        service = self._make_service()
        group_key_expr, join_generation, join_lineage, lineage_primary = (
            service._resolve_group_key_expr("sibling")
        )
        assert group_key_expr is not None
        assert join_generation is True
        assert join_lineage is False
        assert lineage_primary is None

    def test_sibling_group_key_uses_coalesce(self):
        """The final expression should coalesce NULL hashes to 'ungrouped'."""
        service = self._make_service()
        group_key_expr, *_ = service._resolve_group_key_expr("sibling")
        # The expression should be wrapped in coalesce(..., 'ungrouped')
        compiled = str(group_key_expr.compile(compile_kwargs={"literal_binds": True}))
        assert "ungrouped" in compiled.lower()

    def test_unknown_group_by_returns_none(self):
        service = self._make_service()
        group_key_expr, join_generation, join_lineage, lineage_primary = (
            service._resolve_group_key_expr("nonexistent")
        )
        assert group_key_expr is None
        assert join_generation is False
        assert join_lineage is False
        assert lineage_primary is None

    def test_existing_group_by_values_still_work(self):
        """Ensure existing group_by values are unaffected."""
        service = self._make_service()
        for group_by in ("source", "generation", "prompt"):
            group_key_expr, *_ = service._resolve_group_key_expr(group_by)
            assert group_key_expr is not None, f"{group_by} should return a valid expr"

    @pytest.mark.asyncio
    async def test_sibling_meta_payloads_use_scoped_asset_ids(self):
        class _RowsResult:
            def __init__(self, rows):
                self._rows = rows

            def scalars(self):
                return self

            def all(self):
                return self._rows

        service = self._make_service()
        scoped_asset_ids = select(literal(1).label("id")).subquery("scoped_asset_ids")
        service.build_scoped_asset_ids_subquery = MagicMock(return_value=scoped_asset_ids)

        generation = MagicMock()
        generation.id = 123
        generation.reproducible_hash = "hash-abc"
        generation.provider_id = "pixverse"
        generation.operation_type = "text_to_image"
        generation.status = "completed"
        generation.created_at = datetime.now(timezone.utc)
        generation.final_prompt = "A castle on a hill at sunset"

        captured_stmt: list[object] = []

        async def _execute_side_effect(stmt):
            captured_stmt.append(stmt)
            return _RowsResult([generation])

        service.db.execute = AsyncMock(side_effect=_execute_side_effect)

        payloads = await service.build_group_meta_payloads(
            user=MagicMock(),
            group_by="sibling",
            group_keys=["hash-abc"],
        )

        assert service.build_scoped_asset_ids_subquery.call_count == 1
        assert len(captured_stmt) == 1
        assert "scoped_asset_ids" in str(captured_stmt[0])
        assert payloads["hash-abc"]["kind"] == "sibling"
