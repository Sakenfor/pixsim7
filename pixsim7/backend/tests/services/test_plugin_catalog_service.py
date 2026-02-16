"""Tests for PluginCatalogService plugin sync, required-disable, and reseed behavior."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.domain.plugin_catalog import PluginCatalogEntry
from pixsim7.backend.main.services.plugin.plugin_service import PluginCatalogService
from pixsim7.backend.main.shared.schemas.plugin_schemas import PluginSyncItem


class _ScalarResult:
    """Minimal SQLAlchemy scalar result stub for scalar_one_or_none usage."""

    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


def _make_db():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.mark.asyncio
async def test_disable_required_plugin_raises_value_error():
    db = _make_db()
    service = PluginCatalogService(db)

    required_plugin = PluginCatalogEntry(
        plugin_id="ui:required",
        name="Required UI",
        family="ui",
        is_required=True,
        is_builtin=True,
    )
    db.execute.return_value = _ScalarResult(required_plugin)

    with pytest.raises(ValueError, match="required and cannot be disabled"):
        await service.disable_plugin(plugin_id="ui:required", user_id=42)

    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_frontend_plugins_creates_only_missing_entries():
    db = _make_db()
    service = PluginCatalogService(db)

    existing = PluginCatalogEntry(
        plugin_id="scene-view:existing",
        name="Existing Scene View",
        family="scene",
        is_builtin=True,
    )
    db.execute.side_effect = [_ScalarResult(existing), _ScalarResult(None)]

    payload = [
        PluginSyncItem(
            plugin_id="scene-view:existing",
            name="Existing Scene View",
            family="scene",
            plugin_type="ui-overlay",
        ),
        PluginSyncItem(
            plugin_id="tool:new",
            name="New Tool",
            family="tool",
            plugin_type="tool",
            is_required=False,
            metadata={"permissions": ["tool:use"]},
        ),
    ]

    created, skipped, created_ids = await service.sync_frontend_plugins(payload)

    assert created == 1
    assert skipped == 1
    assert created_ids == ["tool:new"]

    db.add.assert_called_once()
    created_entry = db.add.call_args.args[0]
    assert created_entry.plugin_id == "tool:new"
    assert created_entry.source == "frontend-sync"
    assert created_entry.bundle_url is None
    assert created_entry.manifest_url is None
    assert created_entry.is_builtin is True
    assert created_entry.meta == {"permissions": ["tool:use"]}

    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_seed_builtin_plugins_corrects_existing_builtin_record():
    db = _make_db()
    service = PluginCatalogService(db)

    stale_builtin = PluginCatalogEntry(
        plugin_id="scene-view:comic-panels",
        name="Old Comic Panels",
        family="scene",
        bundle_url="http://localhost:8000/plugins/scene/comic-panel-view/plugin.js",
        manifest_url="http://localhost:8000/plugins/scene/comic-panel-view/manifest.json",
        source="bundle",
        is_builtin=True,
        is_required=False,
        meta={"default": False},
    )
    db.execute.return_value = _ScalarResult(stale_builtin)

    seeded = await service.seed_builtin_plugins()

    assert seeded == 1
    assert stale_builtin.name == "Comic Panel View"
    assert stale_builtin.source == "source"
    assert stale_builtin.bundle_url is None
    assert stale_builtin.manifest_url is None
    assert stale_builtin.meta.get("default") is True

    db.commit.assert_awaited_once()
