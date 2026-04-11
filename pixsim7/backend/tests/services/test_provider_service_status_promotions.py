from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import OperationType, ProviderStatus
from pixsim7.backend.main.services.provider.base import ProviderStatusResult
from pixsim7.backend.main.services.provider.events import PROVIDER_COMPLETED, PROVIDER_FAILED
from pixsim7.backend.main.services.provider.provider_service import ProviderService


class _FakeDB:
    async def commit(self) -> None:
        return None

    async def refresh(self, _obj) -> None:
        return None


class _FakeProvider:
    def __init__(self, result: ProviderStatusResult) -> None:
        self._result = result

    async def check_status(self, **_kwargs) -> ProviderStatusResult:
        return ProviderStatusResult(
            status=self._result.status,
            video_url=self._result.video_url,
            thumbnail_url=self._result.thumbnail_url,
            progress=self._result.progress,
            error_message=self._result.error_message,
            metadata=dict(self._result.metadata or {}),
            width=self._result.width,
            height=self._result.height,
            duration_sec=self._result.duration_sec,
            provider_video_id=self._result.provider_video_id,
            has_retrievable_media_url=self._result.has_retrievable_media_url,
            suppress_thumbnail=self._result.suppress_thumbnail,
        )


def _make_submission(*, response: dict) -> SimpleNamespace:
    return SimpleNamespace(
        id=77,
        provider_id="pixverse",
        provider_job_id="pv-job-77",
        generation_id=707,
        submitted_at=datetime.now(timezone.utc) - timedelta(minutes=6),
        payload={},
        response=response,
        duration_ms=None,
    )


@pytest.mark.asyncio
async def test_i2v_filtered_with_cached_video_url_is_promoted_to_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing_video_url = "https://media.pixverse.ai/openapi/output/video-707.mp4"
    submission = _make_submission(
        response={
            "video_url": existing_video_url,
            "metadata": {"provider_status": 10},
        },
    )
    # Dimensions > 0 signals the video was actually rendered (not the
    # initial creation echo which has 0×0 and a CDN URL that 404s).
    # has_retrievable_media_url must be True (from a previous poll that
    # cached the real CDN URL into the submission response).
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=None,
        thumbnail_url=None,
        width=432,
        height=640,
        has_retrievable_media_url=True,
        metadata={"provider_status": 7},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)
    events: list[tuple[str, dict]] = []

    async def _fake_publish(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_VIDEO,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == existing_video_url
    assert submission.response["status"] == "completed"
    assert submission.response["video_url"] == existing_video_url
    assert submission.response["metadata"]["video_early_cdn_terminal"] is True
    assert submission.response["metadata"]["video_original_status"] == "filtered"
    assert any(evt == PROVIDER_COMPLETED for evt, _ in events)
    assert all(evt != PROVIDER_FAILED for evt, _ in events)


@pytest.mark.asyncio
async def test_i2v_processing_with_early_cdn_url_becomes_completed_suppresses_thumbnail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={})
    early_video_url = "https://media.pixverse.ai/openapi/output/video-early.mp4"
    early_thumbnail_url = "https://media.pixverse.ai/openapi/output/thumb-early.jpg"
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=early_video_url,
        thumbnail_url=early_thumbnail_url,
        width=640,
        height=480,
        has_retrievable_media_url=True,
        suppress_thumbnail=True,
        metadata={"provider_status": 5},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )

    async def _fake_publish(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=12),
        operation_type=OperationType.IMAGE_TO_VIDEO,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == early_video_url
    assert returned.thumbnail_url is None  # provider thumbnails suppressed for all video ops
    assert submission.response["status"] == "completed"
    assert submission.response["thumbnail_url"] is None
    assert submission.response["metadata"]["video_early_cdn_terminal"] is True
    assert submission.response["metadata"]["video_original_status"] == "processing"


@pytest.mark.asyncio
async def test_i2v_filtered_with_placeholder_url_is_not_promoted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={})
    placeholder_video_url = "https://media.pixverse.ai/pixverse-preview/mp4/media/default.mp4"
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=placeholder_video_url,
        thumbnail_url="https://media.pixverse.ai/pixverse/jpg/media/default.jpg",
        metadata={
            "provider_status": 7,
            "video_url_is_placeholder": True,
            "has_retrievable_media_url": False,
        },
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)
    events: list[tuple[str, dict]] = []

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )

    async def _fake_publish(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=12),
        operation_type=OperationType.IMAGE_TO_VIDEO,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.FILTERED
    assert submission.response["status"] == "filtered"
    assert submission.response["metadata"]["has_retrievable_media_url"] is False
    assert "i2v_early_cdn_terminal" not in submission.response["metadata"]
    assert all(evt != PROVIDER_COMPLETED for evt, _ in events)
    assert all(evt != PROVIDER_FAILED for evt, _ in events)


@pytest.mark.asyncio
async def test_non_i2v_processing_with_early_cdn_url_is_promoted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={})
    early_video_url = "https://media.pixverse.ai/openapi/output/video-noni2v-early.mp4"
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=early_video_url,
        thumbnail_url="https://media.pixverse.ai/openapi/output/thumb-noni2v-early.jpg",
        width=640,
        height=480,
        has_retrievable_media_url=True,
        suppress_thumbnail=True,
        metadata={"provider_status": 5},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )

    async def _fake_publish(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=13),
        operation_type=OperationType.TEXT_TO_VIDEO,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == early_video_url
    assert returned.thumbnail_url is None
    assert submission.response["status"] == "completed"
    assert submission.response["thumbnail_url"] is None
    assert submission.response["metadata"]["video_early_cdn_terminal"] is True
    assert submission.response["metadata"]["video_original_status"] == "processing"
    assert "i2v_early_cdn_terminal" not in submission.response["metadata"]
    assert "i2v_original_status" not in submission.response["metadata"]


@pytest.mark.asyncio
async def test_non_i2v_pixverse_video_still_suppresses_provider_thumbnail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={})
    status_result = ProviderStatusResult(
        status=ProviderStatus.COMPLETED,
        video_url="https://media.pixverse.ai/openapi/output/video-standard.mp4",
        thumbnail_url="https://media.pixverse.ai/openapi/output/thumb-standard.jpg",
        suppress_thumbnail=True,
        metadata={"provider_status": 10},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )

    async def _fake_publish(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=13),
        operation_type=OperationType.TEXT_TO_VIDEO,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.COMPLETED
    assert returned.thumbnail_url is None
    assert submission.response["status"] == "completed"
    assert submission.response["thumbnail_url"] is None


@pytest.mark.asyncio
async def test_filtered_with_placeholder_promoted_via_previous_poll_retrievable_flag(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A previous poll stored has_retrievable_media_url=True in metadata.
    Current poll returns FILTERED with placeholder URL (has_retrievable=False).
    The stored flag should carry forward and trigger early CDN promotion."""
    stored_video_url = "https://media.pixverse.ai/openapi/output/video-prev-poll.mp4"
    submission = _make_submission(
        response={
            "video_url": stored_video_url,
            "metadata": {
                "provider_status": 10,
                "has_retrievable_media_url": True,  # stored from earlier poll
            },
        },
    )
    # Current check: FILTERED, placeholder URL, but real dimensions
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=None,  # placeholder was nulled by adapter
        thumbnail_url=None,
        width=432,
        height=640,
        has_retrievable_media_url=False,  # current response has no real URL
        suppress_thumbnail=True,
        metadata={"provider_status": 7, "has_retrievable_media_url": False},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)

    async def _fake_publish(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=14),
        operation_type=OperationType.IMAGE_TO_VIDEO,
        poll_cache=None,
    )

    # Should promote: stored flag=True + dims>0 + FILTERED
    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == stored_video_url  # falls back to stored URL
    assert submission.response["metadata"]["video_early_cdn_terminal"] is True
    assert submission.response["metadata"]["video_original_status"] == "filtered"
    assert submission.response["metadata"]["has_retrievable_media_url"] is True


@pytest.mark.asyncio
async def test_filtered_without_previous_retrievable_flag_is_not_promoted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No previous poll stored has_retrievable_media_url. Current is FILTERED
    with placeholder. Should NOT promote — stays FILTERED."""
    submission = _make_submission(
        response={
            "metadata": {"provider_status": 5},
            # No has_retrievable_media_url in stored metadata
        },
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=None,
        thumbnail_url=None,
        width=432,
        height=640,
        has_retrievable_media_url=False,
        suppress_thumbnail=True,
        metadata={"provider_status": 7},
    )

    provider = _FakeProvider(status_result)
    db = _FakeDB()
    service = ProviderService(db)
    events: list[tuple[str, dict]] = []

    async def _fake_publish(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.registry.get",
        lambda _provider_id: provider,
    )
    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.event_bus.publish",
        _fake_publish,
    )

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=15),
        operation_type=OperationType.IMAGE_TO_VIDEO,
        poll_cache=None,
    )

    # Should NOT promote — no retrievable URL ever seen
    assert returned.status == ProviderStatus.FILTERED
    assert submission.response["status"] == "filtered"
    assert "video_early_cdn_terminal" not in submission.response.get("metadata", {})
