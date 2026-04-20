"""Round-trip regression: canonicalize(rehydrate(canonical, ...)) == canonical.

Guards the invariant that retrying a generation from its stored
``canonical_params`` + ``run_context`` produces the same canonical on the
next canonicalization pass.  If this breaks, retry-from-canonical (behind
``PIXSIM_RETRY_FROM_CANONICAL``) cannot be safely enabled.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.domain import OperationType
from pixsim7.backend.main.services.generation.creation_helpers.params import (
    canonicalize_params,
    rehydrate_structured_from_canonical,
)


def _roundtrip(canonical: dict, *, provider_id: str, operation_type: OperationType, run_context=None) -> dict:
    structured = rehydrate_structured_from_canonical(
        canonical,
        provider_id=provider_id,
        operation_type=operation_type,
        run_context=run_context,
    )
    return canonicalize_params(structured, operation_type, provider_id)


def test_roundtrip_text_to_video_pixverse():
    canonical = {
        "model": "v3.5",
        "quality": "720p",
        "seed": 42,
        "duration": 5,
        "aspect_ratio": "16:9",
        "negative_prompt": "blur",
        "prompt": "a dog running",
        "motion_mode": "normal",
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    assert result == canonical


def test_roundtrip_image_to_video_with_composition_assets():
    canonical = {
        "model": "v3.5",
        "quality": "540p",
        "duration": 5,
        "prompt": "extend the scene",
        "composition_assets": [
            {"media_type": "image", "role": "source_image", "asset": "asset:42"},
        ],
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.IMAGE_TO_VIDEO,
    )
    assert result == canonical


def test_roundtrip_preserves_context_blobs():
    canonical = {
        "model": "v3.5",
        "prompt": "hello",
        "scene_context": {"mood": "calm", "setting": "beach"},
        "player_context": {"world_id": 7},
        "social_context": {"age_rating": "general"},
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    assert result == canonical


def test_roundtrip_preserves_artificial_extend():
    canonical = {
        "model": "v3.5",
        "prompt": "more of the same",
        "artificial_extend": {"source_asset_id": 99, "seam_hint": "match"},
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.VIDEO_EXTEND,
    )
    assert result == canonical


def test_roundtrip_video_transition_prompts():
    canonical = {
        "model": "v3.5",
        "duration": 5,
        "prompts": ["first shot", "second shot"],
        "composition_assets": [
            {"media_type": "image", "role": "transition_input", "asset": "asset:1"},
            {"media_type": "image", "role": "transition_input", "asset": "asset:2"},
        ],
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.VIDEO_TRANSITION,
    )
    assert result == canonical


def test_roundtrip_drops_only_derived_fields():
    # composition_metadata is DERIVED from composition_assets by canonicalize;
    # rehydrate deliberately omits it, canonicalize recomputes it on the
    # structured input.  So a canonical with composition_metadata still
    # round-trips cleanly.
    canonical = {
        "model": "v3.5",
        "prompt": "edit please",
        "composition_assets": [
            {"media_type": "image", "role": "composition_reference", "asset": "asset:10"},
            {"media_type": "image", "role": "composition_reference", "asset": "asset:11"},
        ],
    }
    result = _roundtrip(
        canonical,
        provider_id="pixverse",
        operation_type=OperationType.IMAGE_TO_IMAGE,
    )
    # composition_metadata may be added by canonicalize if it derives one;
    # compare ignoring it to keep the contract "round-trip preserves input".
    result.pop("composition_metadata", None)
    assert result == canonical


def test_rehydrate_with_run_context_embeds_under_generation_config():
    structured = rehydrate_structured_from_canonical(
        {"model": "v3.5"},
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
        run_context={"run_id": "r1", "item_index": 3},
    )
    assert structured["generation_config"]["run_context"] == {
        "run_id": "r1",
        "item_index": 3,
    }


def test_rehydrate_empty_canonical_yields_minimal_shape():
    structured = rehydrate_structured_from_canonical(
        {},
        provider_id="pixverse",
        operation_type=OperationType.TEXT_TO_VIDEO,
    )
    # create_generation requires a `generation_config` key; rehydrate always
    # produces at least an empty one.
    assert "generation_config" in structured
    assert structured["generation_config"] == {}
