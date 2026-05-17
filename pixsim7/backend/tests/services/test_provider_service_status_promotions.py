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


def _make_submission(*, response: dict, submitted_at: datetime | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=77,
        provider_id="pixverse",
        provider_job_id="pv-job-77",
        generation_id=707,
        submitted_at=submitted_at or (datetime.now(timezone.utc) - timedelta(minutes=6)),
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


@pytest.mark.asyncio
async def test_video_extend_status5_stays_processing_before_silent_filter_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(
        response={},
        submitted_at=datetime.now(timezone.utc) - timedelta(seconds=45),
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=None,
        thumbnail_url=None,
        width=None,
        height=None,
        has_retrievable_media_url=False,
        suppress_thumbnail=True,
        metadata={"provider_status": 5, "source": "list_fallback", "matched": True},
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
        account=SimpleNamespace(id=16),
        operation_type=OperationType.VIDEO_EXTEND,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.PROCESSING
    assert submission.response["status"] == "processing"
    assert submission.response["metadata"]["extend_silent_filter_candidate"] is True
    assert "extend_silent_filter" not in submission.response["metadata"]


@pytest.mark.asyncio
async def test_video_extend_processing_with_early_cdn_url_is_promoted_to_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(
        response={},
        submitted_at=datetime.now(timezone.utc) - timedelta(seconds=45),
    )
    early_video_url = "https://media.pixverse.ai/openapi/output/video-extend-early.mp4"
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=early_video_url,
        thumbnail_url=None,
        width=720,
        height=1280,
        has_retrievable_media_url=True,
        suppress_thumbnail=True,
        metadata={"provider_status": 5, "source": "list_fallback", "matched": True},
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
        account=SimpleNamespace(id=17),
        operation_type=OperationType.VIDEO_EXTEND,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.COMPLETED
    assert submission.response["status"] == "completed"
    assert submission.response["metadata"]["video_early_cdn_terminal"] is True
    assert submission.response["metadata"]["video_original_status"] == "processing"
    assert "extend_silent_filter" not in submission.response["metadata"]


@pytest.mark.asyncio
async def test_video_extend_status5_promotes_to_filtered_after_silent_filter_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(
        response={},
        submitted_at=datetime.now(timezone.utc) - timedelta(minutes=6),
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=None,
        thumbnail_url=None,
        width=None,
        height=None,
        has_retrievable_media_url=False,
        suppress_thumbnail=True,
        metadata={"provider_status": 5, "source": "list_fallback", "matched": True},
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
        account=SimpleNamespace(id=17),
        operation_type=OperationType.VIDEO_EXTEND,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.FILTERED
    assert submission.response["status"] == "filtered"
    assert submission.response["metadata"]["extend_silent_filter"] is True


# ---------------------------------------------------------------------------
# Pixverse image false-filter CDN salvage
#
# Pixverse returns image_status 7/8/9 (-> FILTERED/FAILED) for jobs that
# actually rendered an image; the pre-allocated CDN object is ground truth.
# check_status HEAD-probes it and, on a real image, recovers the result as
# COMPLETED while reusing the early-CDN contract so the downstream
# billing-skip + provider_flagged path stays correct.
# ---------------------------------------------------------------------------

_IMAGE_URL = "https://media.pixverse.ai/pixverse/i2i/ori/abc-123.png"
_PLACEHOLDER_IMAGE_URL = "https://media.pixverse.ai/pixverse/jpg/media/default.jpg"


def _patch_common(monkeypatch, provider) -> None:
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


def _patch_probe(monkeypatch, result):
    """Mock cdn_head_probe; return a call-counter list."""
    calls: list[str] = []

    async def _fake_probe(url: str):
        calls.append(url)
        return result

    monkeypatch.setattr(
        "pixsim7.backend.main.services.provider.provider_service.cdn_head_probe",
        _fake_probe,
    )
    return calls


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "prior_status, provider_status_int, expected_original",
    [
        (ProviderStatus.FILTERED, 7, "filtered"),
        (ProviderStatus.FAILED, 8, "failed"),
        (ProviderStatus.FAILED, 9, "failed"),
    ],
)
async def test_pixverse_image_false_filter_recovered_when_cdn_serves(
    monkeypatch: pytest.MonkeyPatch,
    prior_status: ProviderStatus,
    provider_status_int: int,
    expected_original: str,
) -> None:
    submission = _make_submission(response={"metadata": {"provider_status": provider_status_int}})
    status_result = ProviderStatusResult(
        status=prior_status,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": provider_status_int, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == [_IMAGE_URL]  # probed exactly once
    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == _IMAGE_URL
    assert returned.thumbnail_url == _IMAGE_URL
    meta = submission.response["metadata"]
    assert meta["image_false_filter_recovered"] is True
    assert meta["video_early_cdn_terminal"] is True
    assert meta["video_original_status"] == expected_original
    assert submission.response["status"] == "completed"


@pytest.mark.asyncio
@pytest.mark.parametrize("probe_result", [False, None])
async def test_pixverse_image_not_recovered_when_cdn_absent_or_inconclusive(
    monkeypatch: pytest.MonkeyPatch,
    probe_result,
) -> None:
    submission = _make_submission(response={"metadata": {"provider_status": 7}})
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 7, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, probe_result)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == [_IMAGE_URL]  # we did probe
    assert returned.status == ProviderStatus.FILTERED
    meta = submission.response.get("metadata") or {}
    assert "image_false_filter_recovered" not in meta
    assert "video_early_cdn_terminal" not in meta


@pytest.mark.asyncio
async def test_pixverse_image_placeholder_url_skips_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={"metadata": {"provider_status": 7}})
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=_PLACEHOLDER_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 7, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == []  # placeholder URL must not be probed
    assert returned.status == ProviderStatus.FILTERED


@pytest.mark.asyncio
async def test_pixverse_image_probe_cached_per_poll_tick(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 7, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)
    poll_cache: dict = {}

    for _ in range(3):
        await service.check_status(
            submission=_make_submission(response={"metadata": {"provider_status": 7}}),
            account=SimpleNamespace(id=11),
            operation_type=OperationType.IMAGE_TO_IMAGE,
            poll_cache=poll_cache,
        )

    # Same job id across the tick -> probed once, served from poll_cache after.
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_pixverse_video_terminal_does_not_trigger_image_salvage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={"metadata": {"provider_status": 7}})
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url="https://media.pixverse.ai/pixverse/mp4/x.mp4",
        thumbnail_url=None,
        metadata={"provider_status": 7},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.TEXT_TO_VIDEO,
        poll_cache=None,
    )

    assert calls == []  # image salvage must not fire for video ops
    assert returned.status == ProviderStatus.FILTERED


# ---------------------------------------------------------------------------
# Pixverse image stuck-PROCESSING CDN salvage
#
# Consumed completion notification leaves status permanently "processing".
# Past the fallback threshold, with the list search exhausted, the CDN
# object is probed; a real image is recovered as early-CDN *terminal*
# (original_status="processing" -> normal billing, NOT provider_flagged).
# ---------------------------------------------------------------------------


class _FakeProviderWithImageList(_FakeProvider):
    """Fake provider that also exposes check_image_status_from_list so the
    image-fallback block (and the nested PROCESSING CDN salvage) runs."""

    async def check_image_status_from_list(self, **_kwargs) -> ProviderStatusResult:
        # List search can't resolve it either (notification consumed,
        # job past the searchable window).
        return ProviderStatusResult(
            status=ProviderStatus.PROCESSING,
            metadata={"is_image": True, "source": "list_fallback", "matched": False},
        )


@pytest.mark.asyncio
async def test_pixverse_image_stuck_processing_recovered_via_cdn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # submitted 6 min ago (default) -> past the 90s non-qwen threshold.
    submission = _make_submission(response={"metadata": {"provider_status": 5}})
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 5, "is_image": True},
    )
    provider = _FakeProviderWithImageList(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == [_IMAGE_URL]
    assert returned.status == ProviderStatus.COMPLETED
    meta = submission.response["metadata"]
    assert meta["image_false_filter_recovered"] is True
    assert meta["video_early_cdn_terminal"] is True
    # NOT "filtered" -> is_early_cdn_filtered() stays False -> normal billing,
    # no provider_flagged (a stale-processing render was never a verdict).
    assert meta["video_original_status"] == "processing"


@pytest.mark.asyncio
async def test_pixverse_image_stuck_processing_not_recovered_when_cdn_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    submission = _make_submission(response={"metadata": {"provider_status": 5}})
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 5, "is_image": True},
    )
    provider = _FakeProviderWithImageList(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, False)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == [_IMAGE_URL]
    assert returned.status == ProviderStatus.PROCESSING
    meta = submission.response.get("metadata") or {}
    assert "image_false_filter_recovered" not in meta


@pytest.mark.asyncio
async def test_pixverse_image_recent_processing_not_probed_before_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Submitted 5s ago -> below the fallback threshold; no list search,
    # no CDN probe (don't hammer normal in-flight images).
    submission = _make_submission(
        response={"metadata": {"provider_status": 5}},
        submitted_at=datetime.now(timezone.utc) - timedelta(seconds=5),
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.PROCESSING,
        video_url=_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 5, "is_image": True},
    )
    provider = _FakeProviderWithImageList(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert calls == []
    assert returned.status == ProviderStatus.PROCESSING


# ---------------------------------------------------------------------------
# Terminal-salvage deferral (finalize-site agnostic). Pixverse flips
# image_status to 8/9 a few seconds before the i2i/ori object is flushed; a
# generation removed from the poll set the instant it goes terminal
# (quickgen burst-cancel, retries-exhausted, deferred cancel) gets no later
# salvage tick. Within a bounded window the job is kept PROCESSING so the
# salvage re-probes on subsequent ticks, regardless of who would finalize it.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pixverse_image_terminal_deferred_within_window_then_recovered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Genuine i2i: Pixverse returned status 9 (FAILED) but the ori url is
    # already stamped in submission.response from a prior list-batch match.
    # The object isn't flushed yet on this tick (probe False) — instead of
    # finalising terminal, defer (PROCESSING) so a later tick re-probes.
    submission = _make_submission(
        response={
            "asset_url": _IMAGE_URL,
            "metadata": {"provider_status": 9},
        },
        submitted_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )

    def _status_9_failed() -> ProviderStatusResult:
        return ProviderStatusResult(
            status=ProviderStatus.FAILED,
            video_url=None,
            thumbnail_url=None,
            metadata={"provider_status": 9, "is_image": True},
        )

    service = ProviderService(_FakeDB())

    # Tick 1: object not on the CDN yet -> deferred, not terminal.
    provider = _FakeProvider(_status_9_failed())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, False)
    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )
    assert calls == [_IMAGE_URL]  # salvage did probe
    assert returned.status == ProviderStatus.PROCESSING
    meta = submission.response["metadata"]
    assert meta["image_terminal_salvage_deferred"] is True
    assert meta["image_terminal_salvage_deferred_status"] == "failed"
    assert submission.response["status"] == "processing"
    assert "image_false_filter_recovered" not in meta

    # Tick 2: object now flushed -> recovered to COMPLETED via the existing
    # early-CDN-terminal contract, original status preserved as "failed"
    # (normal billing, never provider_flagged).
    provider = _FakeProvider(_status_9_failed())
    _patch_common(monkeypatch, provider)
    calls = _patch_probe(monkeypatch, True)
    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )
    assert returned.status == ProviderStatus.COMPLETED
    assert returned.video_url == _IMAGE_URL
    meta = submission.response["metadata"]
    assert meta["image_false_filter_recovered"] is True
    assert meta["video_early_cdn_terminal"] is True
    assert meta["video_original_status"] == "failed"
    assert submission.response["status"] == "completed"


@pytest.mark.asyncio
async def test_pixverse_image_terminal_not_deferred_after_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Past the bounded window with the object still absent: emit the real
    # terminal status (genuine fail), no indefinite deferral.
    submission = _make_submission(
        response={
            "asset_url": _IMAGE_URL,
            "metadata": {"provider_status": 9},
        },
        submitted_at=datetime.now(timezone.utc) - timedelta(minutes=6),
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.FAILED,
        video_url=None,
        thumbnail_url=None,
        metadata={"provider_status": 9, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    _patch_probe(monkeypatch, False)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.FAILED
    meta = submission.response.get("metadata") or {}
    assert "image_terminal_salvage_deferred" not in meta


@pytest.mark.asyncio
async def test_pixverse_image_terminal_deferral_requires_candidate_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Recent submission but no real pre-allocated object (placeholder url):
    # nothing to re-probe, so don't needlessly delay a genuine filter.
    submission = _make_submission(
        response={
            "asset_url": _PLACEHOLDER_IMAGE_URL,
            "metadata": {"provider_status": 7},
        },
        submitted_at=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    status_result = ProviderStatusResult(
        status=ProviderStatus.FILTERED,
        video_url=_PLACEHOLDER_IMAGE_URL,
        thumbnail_url=None,
        metadata={"provider_status": 7, "is_image": True},
    )
    provider = _FakeProvider(status_result)
    service = ProviderService(_FakeDB())
    _patch_common(monkeypatch, provider)
    _patch_probe(monkeypatch, False)

    returned = await service.check_status(
        submission=submission,
        account=SimpleNamespace(id=11),
        operation_type=OperationType.IMAGE_TO_IMAGE,
        poll_cache=None,
    )

    assert returned.status == ProviderStatus.FILTERED
    meta = submission.response.get("metadata") or {}
    assert "image_terminal_salvage_deferred" not in meta
