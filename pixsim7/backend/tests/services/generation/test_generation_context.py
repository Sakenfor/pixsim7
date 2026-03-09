from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.services.generation.context import extract_flat_provider_params
from pixsim7.backend.main.services.generation.context import (
    build_generation_context_from_generation,
    extract_source_asset_ids,
)


def test_extract_flat_provider_params_keeps_aspect_ratio_from_provider_style() -> None:
    canonical_params = {
        "generation_config": {
            "style": {
                "pixverse": {
                    "model": "pv-v1",
                    "aspect_ratio": "9:16",
                }
            }
        }
    }

    flat = extract_flat_provider_params(canonical_params)

    assert flat["aspect_ratio"] == "9:16"


def test_extract_flat_provider_params_keeps_aspect_ratio_from_top_level_config() -> None:
    canonical_params = {
        "generation_config": {
            "style": {"pixverse": {"model": "pv-v1"}},
            "aspect_ratio": "1:1",
        }
    }

    flat = extract_flat_provider_params(canonical_params)

    assert flat["aspect_ratio"] == "1:1"


def test_extract_flat_provider_params_handles_already_flat_canonical_params() -> None:
    """canonical_params from canonicalize_params() is already flat — model should be preserved."""
    canonical_params = {
        "model": "gemini-2.5-flash",
        "quality": "720p",
        "seed": 42,
        "aspect_ratio": "16:9",
        "duration": 5,
        "composition_assets": [{"asset": "asset:1", "role": "source_image"}],
    }

    flat = extract_flat_provider_params(canonical_params)

    assert flat["model"] == "gemini-2.5-flash"
    assert flat["quality"] == "720p"
    assert flat["seed"] == 42
    assert flat["aspect_ratio"] == "16:9"
    assert flat["duration"] == 5
    assert flat["composition_assets"] == [{"asset": "asset:1", "role": "source_image"}]


def test_extract_flat_provider_params_flat_filters_internal_keys() -> None:
    """Internal/structural keys should not leak into flat params."""
    canonical_params = {
        "model": "v5",
        "scene_context": {"from_scene": None},
        "composition_metadata": {"some": "data"},
    }

    flat = extract_flat_provider_params(canonical_params)

    assert flat["model"] == "v5"
    assert "scene_context" not in flat
    assert "composition_metadata" not in flat


def test_build_generation_context_from_generation_includes_preferred_account_id() -> None:
    generation = SimpleNamespace(
        canonical_params={
            "generation_config": {
                "style": {
                    "pixverse": {
                        "model": "pv-v1",
                    }
                }
            }
        },
        inputs=[],
        operation_type="text_to_video",
        provider_id="pixverse",
        final_prompt="prompt",
        prompt_version_id=None,
        reproducible_hash=None,
        preferred_account_id=123,
    )

    ctx = build_generation_context_from_generation(generation)

    assert ctx["params"]["preferred_account_id"] == 123


def test_extract_source_asset_ids_handles_flexible_ref_shapes() -> None:
    inputs = [
        {"asset": "asset:10"},
        {"asset": {"type": "asset", "id": 11}},
        {"asset": "12"},
        {"asset": "https://example.com/assets/99"},
        {"asset": {"type": "scene", "id": 5}},
        {"asset": None},
        {"foo": "bar"},
        "skip",
    ]

    assert extract_source_asset_ids(inputs) == [10, 11, 12]
