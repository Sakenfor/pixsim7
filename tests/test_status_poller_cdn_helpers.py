"""Tests for PixverseModerationMixin.moderation_recheck."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from pixsim7.backend.main.domain import ProviderStatus
from pixsim7.backend.main.services.provider.base import ProviderStatusResult
from pixsim7.backend.main.services.provider.adapters.pixverse_moderation import (
    PixverseModerationMixin,
)


class _FakeMixin(PixverseModerationMixin):
    """Minimal concrete class so we can instantiate the mixin."""

    def __init__(self, status_result: ProviderStatusResult | None = None):
        self._status_result = status_result

    async def check_status(self, **_kw) -> ProviderStatusResult:
        if self._status_result is None:
            raise RuntimeError("no status configured")
        return self._status_result


@pytest.mark.asyncio
async def test_cdn_ok_returns_ok():
    mixin = _FakeMixin()
    account = SimpleNamespace(id=1)
    with patch(
        "pixsim7.backend.main.services.provider.adapters.pixverse_moderation.cdn_head_probe",
        new_callable=AsyncMock,
        return_value=True,
    ):
        result = await mixin.moderation_recheck(
            account=account,
            provider_job_id="job-1",
            asset_remote_url="https://media.pixverse.ai/web/ori/video.mp4",
        )
    assert result.is_ok
    assert not result.should_refresh_credits


@pytest.mark.asyncio
async def test_cdn_miss_and_provider_filtered_returns_flagged():
    status = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        metadata={"provider_status": 7},
    )
    mixin = _FakeMixin(status_result=status)
    account = SimpleNamespace(id=1)
    with patch(
        "pixsim7.backend.main.services.provider.adapters.pixverse_moderation.cdn_head_probe",
        new_callable=AsyncMock,
        return_value=False,
    ):
        result = await mixin.moderation_recheck(
            account=account,
            provider_job_id="job-2",
            asset_remote_url="https://media.pixverse.ai/web/ori/video.mp4",
        )
    assert result.is_flagged
    assert result.should_refresh_credits


@pytest.mark.asyncio
async def test_cdn_miss_and_provider_completed_returns_inconclusive():
    status = ProviderStatusResult(
        status=ProviderStatus.COMPLETED,
        metadata={"provider_status": 1},
    )
    mixin = _FakeMixin(status_result=status)
    account = SimpleNamespace(id=1)
    with patch(
        "pixsim7.backend.main.services.provider.adapters.pixverse_moderation.cdn_head_probe",
        new_callable=AsyncMock,
        return_value=False,
    ):
        result = await mixin.moderation_recheck(
            account=account,
            provider_job_id="job-3",
            asset_remote_url="https://media.pixverse.ai/web/ori/video.mp4",
        )
    assert not result.is_flagged
    assert not result.is_ok
    assert result.outcome == "inconclusive"


@pytest.mark.asyncio
async def test_no_url_falls_through_to_provider_api():
    status = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        metadata={"provider_status": 7},
    )
    mixin = _FakeMixin(status_result=status)
    account = SimpleNamespace(id=1)
    # No CDN probe patching needed — no URL means probe is skipped
    result = await mixin.moderation_recheck(
        account=account,
        provider_job_id="job-4",
        asset_remote_url=None,
    )
    assert result.is_flagged
