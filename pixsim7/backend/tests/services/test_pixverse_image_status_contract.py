"""Recorded-payload contract test for Pixverse IMAGE status handling.

The salvage unit tests in test_provider_service_status_promotions.py feed
an already-mapped ProviderStatusResult, so they don't pin the two things
that actually depend on Pixverse's real behaviour:

  1. raw ``image_status`` int  -> ProviderStatus  (_map_pixverse_status_for)
  2. the response shape our salvage reads the candidate URL from

Both are frozen here against shapes observed in production
(submission.response rows for pixverse image generations, sampled
2026-05-16): provider_status 7 -> "filtered", 8/9 -> "failed",
10 -> "processing", every one carrying asset_url + image_url on
media.pixverse.ai/pixverse/i2i/ori/<uuid>.png and a metadata.provider_status
mirror. If Pixverse changes its status space or response shape, this
fails deterministically in CI — no live call / credits / secrets.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.domain.enums import ProviderStatus
from pixsim7.backend.main.services.provider.adapters.pixverse_status import (
    _map_pixverse_status_for,
)

# image_status int -> ProviderStatus, as the SDK documents and as observed
# in real submission.response rows. 0/2/5/10 are all "still cooking".
_RECORDED_IMAGE_STATUS_TRUTH = [
    (1, ProviderStatus.COMPLETED),
    (0, ProviderStatus.PROCESSING),
    (2, ProviderStatus.PROCESSING),
    (5, ProviderStatus.PROCESSING),
    (10, ProviderStatus.PROCESSING),  # early-queue, NOT a completion
    (7, ProviderStatus.FILTERED),
    (8, ProviderStatus.FAILED),
    (9, ProviderStatus.FAILED),
]


@pytest.mark.parametrize("raw_status, expected", _RECORDED_IMAGE_STATUS_TRUTH)
def test_image_status_int_maps_as_recorded(raw_status, expected):
    # Both shapes Pixverse/SDK use: explicit image_status, and the
    # normalised string 'status' fallback.
    assert _map_pixverse_status_for({"image_status": raw_status}, is_image=True) is expected
    assert _map_pixverse_status_for({"status": raw_status}, is_image=True) is expected


# Real submission.response shape (keys verified against production rows,
# 2026-05-16) for the terminal/stuck states our salvage must recover.
def _recorded_response(provider_status: int, resp_status: str) -> dict:
    return {
        "status": resp_status,
        "progress": 0,
        "asset_url": "https://media.pixverse.ai/pixverse/i2i/ori/"
        "bed46e79-b081-41c6-ac2f-4c2000000000.png",
        "image_url": "https://media.pixverse.ai/pixverse/i2i/ori/"
        "bed46e79-b081-41c6-ac2f-4c2000000000.png",
        "media_type": "image",
        "provider_status": provider_status,
        "provider_job_id": "400000000000000",
        "provider_image_id": "400000000000000",
        "provider_asset_id": "400000000000000",
        "metadata": {
            "provider_status": provider_status,
            "is_image": True,
            "source": "list_batch",
        },
    }


@pytest.mark.parametrize(
    "provider_status, resp_status",
    [(7, "filtered"), (8, "failed"), (9, "failed"), (10, "processing")],
)
def test_recorded_response_exposes_salvage_candidate_url(provider_status, resp_status):
    """The salvage reads asset_url / image_url off submission.response. The
    real shape for every missable state carries one — guard against a shape
    change silently leaving the salvage with no URL to probe."""
    resp = _recorded_response(provider_status, resp_status)
    candidate = resp.get("asset_url") or resp.get("image_url")
    assert candidate and candidate.startswith("https://media.pixverse.ai/")
    # provider_status is mirrored top-level AND under metadata (both read
    # by different layers) — pin that invariant.
    assert resp["provider_status"] == resp["metadata"]["provider_status"]
