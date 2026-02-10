"""Tests for sibling (reproducible_hash) grouping in AssetCoreService."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

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
