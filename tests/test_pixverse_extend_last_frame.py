"""Tests for VIDEO_EXTEND last-frame URL plumbing.

Background: Pixverse's extend endpoint accepts a ``customer_video_last_frame_url``
field.  When we send it, Pixverse seeds the extend from that pristine rendered
frame instead of re-decoding the mp4 server-side (which produces a blurry
first frame).  The adapter pulls the source Asset's
``media_metadata['provider_thumbnail_url']`` in ``prepare_execution_params``
and stamps it as ``result_params['last_frame_url']``; ``_extend_video`` then
wraps that into the dict shape the SDK expects.

These tests exercise the handler side (SDK-dict construction) so future
refactors can't silently drop the field on the way to Pixverse.
"""
import types

import pytest

from pixsim7.backend.main.services.provider.adapters import pixverse_operations as ops
from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
from pixsim7.backend.main.services.provider.base import ProviderError


class _DummyOptions:
    def model_dump(self) -> dict:
        return {}


@pytest.fixture(autouse=True)
def _stub_options(monkeypatch):
    """Replace the real option builder with an empty dict — isolates these
    tests from schema evolution on GenerationOptions."""
    monkeypatch.setattr(ops, "_build_generation_options", lambda params: _DummyOptions())


def _capture_extend_client():
    """Return (client, calls) where ``calls`` records every ``extend`` call."""
    calls: list[dict] = []

    class FakeClient:
        async def extend(self, *, video_url, prompt, **kwargs):
            calls.append({"video_url": video_url, "prompt": prompt, "kwargs": kwargs})
            return types.SimpleNamespace(id="extended_vid")

    return FakeClient(), calls


@pytest.mark.asyncio
async def test_extend_forwards_last_frame_url_as_dict_when_present():
    """When prepare_execution_params stamped last_frame_url + original_video_id,
    the handler must pack them into a dict so the SDK sends
    customer_video_last_frame_url."""
    provider = PixverseProvider()
    client, calls = _capture_extend_client()

    await provider._extend_video(
        client,
        {
            "prompt": "continue the scene",
            "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/source.mp4",
            "original_video_id": "385991605850788",
            "last_frame_url": "https://media.pixverse.ai/pixverse/mp4/media/web/ori/pristine.jpg",
        },
    )

    assert len(calls) == 1
    vref = calls[0]["video_url"]
    assert isinstance(vref, dict), "handler must switch to dict form when last_frame_url is set"
    assert vref["last_frame_url"] == (
        "https://media.pixverse.ai/pixverse/mp4/media/web/ori/pristine.jpg"
    )
    assert vref["original_video_id"] == "385991605850788"
    assert vref["url"] == "https://media.pixverse.ai/pixverse/v2v/ori/source.mp4"


@pytest.mark.asyncio
async def test_extend_dict_with_only_url_and_last_frame_skips_original_id_key():
    """If there's no original_video_id, the dict should still include
    last_frame_url + url — Pixverse can extend from URL alone."""
    provider = PixverseProvider()
    client, calls = _capture_extend_client()

    await provider._extend_video(
        client,
        {
            "prompt": "continue",
            "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/source.mp4",
            "last_frame_url": "https://media.pixverse.ai/pixverse/mp4/media/web/ori/pristine.jpg",
        },
    )

    vref = calls[0]["video_url"]
    assert isinstance(vref, dict)
    assert vref["last_frame_url"].endswith("pristine.jpg")
    assert vref["url"].endswith("source.mp4")
    assert "original_video_id" not in vref


@pytest.mark.asyncio
async def test_extend_falls_back_to_id_string_when_no_last_frame_url():
    """Legacy path: no last_frame_url stamped → use the existing
    ``video_id:<id>`` shortcut the adapter has always emitted.  Protects
    against regressions in the unchanged code path."""
    provider = PixverseProvider()
    client, calls = _capture_extend_client()

    await provider._extend_video(
        client,
        {
            "prompt": "continue",
            "video_url": "https://media.pixverse.ai/pixverse/v2v/ori/source.mp4",
            "original_video_id": "385991605850788",
        },
    )

    assert calls[0]["video_url"] == "video_id:385991605850788"


@pytest.mark.asyncio
async def test_extend_falls_back_to_url_string_when_only_url_is_present():
    """No id, no last_frame → plain URL string (unchanged legacy behavior)."""
    provider = PixverseProvider()
    client, calls = _capture_extend_client()

    await provider._extend_video(
        client,
        {
            "prompt": "continue",
            "video_url": "https://external.example.com/video.mp4",
        },
    )

    assert calls[0]["video_url"] == "https://external.example.com/video.mp4"


@pytest.mark.asyncio
async def test_extend_raises_when_no_video_reference_at_all():
    """Missing every reference key → ProviderError, even if last_frame_url
    is somehow in params.  A frame alone is not enough — Pixverse needs
    either id or video url."""
    provider = PixverseProvider()
    client, calls = _capture_extend_client()

    with pytest.raises(ProviderError):
        await provider._extend_video(
            client,
            {
                "prompt": "continue",
                "last_frame_url": "https://media.pixverse.ai/.../pristine.jpg",
            },
        )

    assert not calls


