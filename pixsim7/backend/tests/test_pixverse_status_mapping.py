"""
Tests for the Pixverse status mapper, covering native vs fal-proxied dispatch.

The SDK-level mapping lives in ``pixverse.api.client._parse_video_response``;
these tests cover the backend wrapper at
``pixsim7.backend.main.services.provider.adapters.pixverse_status._map_pixverse_status_for``,
which sees both string-normalized payloads (after SDK parsing) and raw int
payloads (when callers feed dicts directly).
"""
from pixsim7.backend.main.domain.enums import ProviderStatus
from pixsim7.backend.main.services.provider.adapters.pixverse_status import (
    _map_pixverse_status_for,
)


class TestStringTokenMapping:
    """Tokens produced by the SDK after status_code → string normalization."""

    def test_interrupted_maps_to_filtered(self):
        # Fal-proxied "interrupted" (partner refused mid-stream) reuses the
        # FILTERED enum so refund / skip-billing logic kicks in. The lifecycle
        # distinction is preserved at the SDK string layer for diagnostics.
        result = _map_pixverse_status_for({"video_status": "interrupted"}, is_image=False)
        assert result == ProviderStatus.FILTERED

    def test_filtered_still_maps_to_filtered(self):
        result = _map_pixverse_status_for({"video_status": "filtered"}, is_image=False)
        assert result == ProviderStatus.FILTERED

    def test_failed_still_maps_to_failed(self):
        result = _map_pixverse_status_for({"video_status": "failed"}, is_image=False)
        assert result == ProviderStatus.FAILED


class TestIntCodeNativeDispatch:
    """Native v5/v6/etc. status code mapping (existing behavior)."""

    def test_native_8_is_failed(self):
        # Native models: 8 = failed.
        payload = {"video_status": 8, "model": "v6"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.FAILED

    def test_native_9_is_failed(self):
        payload = {"video_status": 9, "model": "v6"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.FAILED

    def test_native_10_with_dims_is_completed(self):
        payload = {"video_status": 10, "model": "v6", "output_width": 720, "output_height": 1280}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.COMPLETED

    def test_native_10_without_dims_is_processing(self):
        # The "false-10" case Pixverse returns before rendering completes.
        payload = {"video_status": 10, "model": "v6", "output_width": 0, "output_height": 0}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.PROCESSING


class TestIntCodeFalProxiedDispatch:
    """Fal-proxied models: 9 = queued, 10 = processing, 8 = interrupted."""

    def test_happyhorse_8_is_filtered_not_failed(self):
        # 8 = interrupted (Pixverse UI label "generation interrupted") for fal-
        # proxied models. Maps to FILTERED so refund applies.
        payload = {"video_status": 8, "model": "happyhorse-1.0"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.FILTERED

    def test_happyhorse_9_is_processing_not_failed(self):
        # 9 is the initial state on fal-proxied jobs (was incorrectly "failed").
        payload = {"video_status": 9, "model": "happyhorse-1.0"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.PROCESSING

    def test_happyhorse_10_is_processing_not_completed(self):
        # 10 means "forwarded to fal" for fal-proxied jobs, NOT completed.
        # (For native, 10 = completed when dims are real.)
        payload = {"video_status": 10, "model": "happyhorse-1.0"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.PROCESSING

    def test_happyhorse_1_is_completed(self):
        payload = {"video_status": 1, "model": "happyhorse-1.0"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.COMPLETED

    def test_grok_imagine_follows_same_table(self):
        # grok-imagine is also fal-proxied — must dispatch the same way.
        payload = {"video_status": 8, "model": "grok-imagine"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.FILTERED
        payload = {"video_status": 9, "model": "grok-imagine"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.PROCESSING

    def test_unknown_model_falls_through_to_native_table(self):
        # Defensive: if the model isn't registered, treat it as native.
        # Better to over-fail than over-complete.
        payload = {"video_status": 8, "model": "some-future-model"}
        assert _map_pixverse_status_for(payload, is_image=False) == ProviderStatus.FAILED
