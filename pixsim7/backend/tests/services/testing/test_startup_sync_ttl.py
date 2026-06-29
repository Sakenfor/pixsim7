from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.services.sync.ttl import TtlSync
from pixsim7.backend.main.shared.datetime_utils import utcnow


class _ScalarResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


@pytest.mark.asyncio
async def test_startup_test_sync_skips_when_db_catalog_is_recent(monkeypatch):
    from pixsim7.backend.main.services.testing import sync

    monkeypatch.setattr(sync, "_ttl", TtlSync("test_suites", ttl_seconds=300))
    sync._ttl.invalidate()

    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(utcnow())),
    )
    sync_test_suites = AsyncMock()
    monkeypatch.setattr(sync, "sync_test_suites", sync_test_suites)

    result = await sync.ensure_startup_synced(db)

    assert result is None
    sync_test_suites.assert_not_awaited()
    assert not sync._ttl.is_stale


@pytest.mark.asyncio
async def test_startup_test_sync_runs_when_db_catalog_is_stale(monkeypatch):
    from pixsim7.backend.main.services.testing import sync

    monkeypatch.setattr(sync, "_ttl", TtlSync("test_suites", ttl_seconds=300))
    stale_at = utcnow() - timedelta(seconds=301)
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_ScalarResult(stale_at)),
        commit=AsyncMock(),
    )
    sync_test_suites = AsyncMock(
        return_value=SimpleNamespace(
            created=1,
            updated=2,
            removed=0,
            unchanged=3,
        )
    )
    monkeypatch.setattr(sync, "sync_test_suites", sync_test_suites)

    result = await sync.ensure_startup_synced(db)

    sync_test_suites.assert_awaited_once_with(db)
    db.commit.assert_awaited_once()
    assert result is not None
    assert result.ran is True
