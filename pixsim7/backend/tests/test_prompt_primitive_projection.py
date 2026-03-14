import asyncio

from pixsim7.backend.main.services.prompt.parser.dsl_adapter import (
    parse_prompt_to_candidates,
)
from pixsim7.backend.main.services.prompt.parser.primitive_projection import (
    enrich_candidates_with_primitive_projection,
    match_candidate_to_primitive,
)

TEST_SUITE = {
    "id": "prompt-primitive-projection",
    "label": "Prompt Primitive Projection Tests",
    "kind": "unit",
    "category": "backend/prompt-analysis",
    "subcategory": "primitive-projection",
    "covers": [
        "pixsim7/backend/main/services/prompt/parser/dsl_adapter.py",
        "pixsim7/backend/main/services/prompt/parser/primitive_projection.py",
    ],
    "order": 27,
}


def _synthetic_index():
    return (
        {
            "block_id": "core.camera.motion.dolly",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset(
                {
                    "camera",
                    "motion",
                    "dolly",
                    "forward",
                    "slow",
                }
            ),
            "block_tokens": frozenset({"core", "camera", "motion", "dolly"}),
            "op_id": "camera.motion.dolly",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.camera.motion.zoom",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"camera", "motion", "zoom", "in", "slow"}),
            "block_tokens": frozenset({"core", "camera", "motion", "zoom"}),
            "op_id": "camera.motion.zoom",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video", "image"),
        },
    )


def test_match_candidate_to_primitive_prefers_specific_overlap():
    candidate = {
        "text": "Slow dolly-in shot.",
        "role": "camera",
        "matched_keywords": ["dolly"],
        "metadata": {},
    }
    match = match_candidate_to_primitive(
        candidate,
        primitive_index=_synthetic_index(),
    )
    assert match is not None
    assert match.get("block_id") == "core.camera.motion.dolly"
    assert match.get("mode") == "shadow"
    assert match.get("score", 0.0) >= 0.45
    assert match.get("op", {}).get("signature_id") == "camera.motion.v1"


def test_match_candidate_to_primitive_skips_role_only_hits():
    candidate = {
        "text": "Camera shot.",
        "role": "camera",
        "matched_keywords": [],
        "metadata": {},
    }
    match = match_candidate_to_primitive(
        candidate,
        primitive_index=_synthetic_index(),
    )
    assert match is None


def test_enrich_candidates_projection_off_is_noop():
    candidates = [
        {
            "text": "Slow dolly-in shot.",
            "role": "camera",
            "matched_keywords": ["dolly"],
            "metadata": {},
        }
    ]
    enriched = enrich_candidates_with_primitive_projection(
        candidates,
        mode="off",
        primitive_index=_synthetic_index(),
    )
    assert enriched is candidates
    assert "primitive_match" not in (enriched[0].get("metadata") or {})


def test_parse_prompt_to_candidates_runs_shadow_projection_by_default(monkeypatch):
    calls = {"count": 0, "mode": None}

    def _fake_enrich(candidates, *, mode, primitive_index=None):
        calls["count"] += 1
        calls["mode"] = mode
        for candidate in candidates:
            metadata = candidate.get("metadata") or {}
            metadata["primitive_match"] = {
                "mode": mode,
                "block_id": "test.block",
                "score": 0.5,
            }
            candidate["metadata"] = metadata
        return candidates

    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.parser.dsl_adapter.enrich_candidates_with_primitive_projection",
        _fake_enrich,
    )

    result = asyncio.run(parse_prompt_to_candidates("A vampire stands in the rain."))
    assert calls["count"] == 1
    assert calls["mode"] == "shadow"
    assert len(result.get("candidates") or []) >= 1
    assert (
        result["candidates"][0]
        .get("metadata", {})
        .get("primitive_match", {})
        .get("block_id")
        == "test.block"
    )


def test_parse_prompt_to_candidates_can_disable_projection(monkeypatch):
    calls = {"count": 0}

    def _fake_enrich(candidates, *, mode, primitive_index=None):
        calls["count"] += 1
        return candidates

    monkeypatch.setattr(
        "pixsim7.backend.main.services.prompt.parser.dsl_adapter.enrich_candidates_with_primitive_projection",
        _fake_enrich,
    )

    result = asyncio.run(
        parse_prompt_to_candidates(
            "A vampire stands in the rain.",
            parser_config={"primitive_projection_mode": "off"},
        )
    )
    assert calls["count"] == 0
    assert len(result.get("candidates") or []) >= 1
    for candidate in result["candidates"]:
        assert "primitive_match" not in (candidate.get("metadata") or {})
