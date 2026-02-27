from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.services.generation.context import extract_flat_provider_params
from pixsim7.backend.main.services.generation.context import build_generation_context_from_generation


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
