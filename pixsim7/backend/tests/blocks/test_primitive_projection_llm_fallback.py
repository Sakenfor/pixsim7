"""Tests for the optional LLM semantic fallback for primitive projection.

No network: the AiHubService LLM seam is monkeypatched. Asserts default-off is
a pure no-op and that enabled + a valid LLM response re-projects only weak
candidates onto real catalog entries, with graceful degradation on every
failure mode.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from pixsim7.backend.main.services.prompt.parser import primitive_projection_llm as ppl
from pixsim7.backend.main.services.prompt.parser.primitive_projection_llm import (
    PROJECTION_STRATEGY_LLM,
    build_primitive_catalog,
    enrich_candidates_with_llm_projection_fallback,
)
from pixsim7.backend.main.services.prompt.parser.primitive_projection_settings import (
    PrimitiveProjectionSettings,
)


def _index():
    return (
        {
            "block_id": "core.camera.motion.dolly",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "op_id": "camera.motion.dolly",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
            "tokens": frozenset({"dolly", "camera", "forward"}),
            "context_synonyms": frozenset({"glide", "push in"}),
            "phrases": frozenset(),
        },
        {
            "block_id": "core.light.state.soft_warm",
            "package_name": "core_light",
            "role": None,
            "category": "light",
            "op_id": "light.state.set",
            "signature_id": "light.state.v1",
            "op_modalities": ("both",),
            "tokens": frozenset({"soft", "warm", "light"}),
            "context_synonyms": frozenset({"glow", "tungsten"}),
            "phrases": frozenset(),
        },
    )


def _weak_candidate(text: str):
    return {
        "text": text,
        "role": None,
        "primitive_projection": {
            "engine": "token_overlap_v2",
            "mode": "shadow",
            "status": "no_signal",
            "selected_index": None,
            "hypotheses": [],
            "suppression_reason": "no_signal",
        },
    }


class _FakeAiHub:
    """Stand-in for AiHubService with a scripted response."""

    response_text = '{"matches":[{"i":0,"block_id":"core.camera.motion.dolly","confidence":0.82,"reason":"glide = dolly"}]}'
    delay = 0.0

    def __init__(self, db):  # noqa: D401 - signature parity
        self.db = db

    async def resolve_provider_and_model(self, *, provider_id, model_id):
        return ("anthropic-llm", "claude-haiku")

    async def execute_prompt(self, **kwargs):
        if _FakeAiHub.delay:
            await asyncio.sleep(_FakeAiHub.delay)
        return {"prompt_after": _FakeAiHub.response_text}


@pytest.fixture(autouse=True)
def _patch_ai_hub(monkeypatch):
    _FakeAiHub.response_text = '{"matches":[{"i":0,"block_id":"core.camera.motion.dolly","confidence":0.82,"reason":"glide = dolly"}]}'
    _FakeAiHub.delay = 0.0
    monkeypatch.setattr(
        "pixsim7.backend.main.services.llm.ai_hub_service.AiHubService",
        _FakeAiHub,
    )


def _run(coro):
    return asyncio.run(coro)


def test_disabled_is_pure_noop(monkeypatch):
    # If disabled, the LLM seam must never be constructed/called.
    def _boom(*a, **k):  # pragma: no cover - asserts non-invocation
        raise AssertionError("AiHubService must not be used when disabled")

    monkeypatch.setattr(
        "pixsim7.backend.main.services.llm.ai_hub_service.AiHubService", _boom
    )
    candidates = [_weak_candidate("the camera glides through the doorway")]
    settings = PrimitiveProjectionSettings(llm_fallback_enabled=False)
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out is candidates
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_enabled_reprojects_weak_candidate():
    candidates = [_weak_candidate("the camera glides through the doorway")]
    settings = PrimitiveProjectionSettings(llm_fallback_enabled=True)
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    proj = out[0]["primitive_projection"]
    assert proj["engine"] == PROJECTION_STRATEGY_LLM
    assert proj["status"] == "matched"
    assert proj["fallback_of"] == "no_signal"
    hyp = proj["hypotheses"][0]
    assert hyp["block_id"] == "core.camera.motion.dolly"
    assert hyp["op"]["op_id"] == "camera.motion.dolly"
    assert hyp["strategy"] == PROJECTION_STRATEGY_LLM


def test_matched_candidate_is_not_touched():
    good = {
        "text": "slow dolly forward",
        "primitive_projection": {
            "engine": "token_overlap_v2",
            "mode": "shadow",
            "status": "matched",
            "selected_index": 0,
            "hypotheses": [{"block_id": "core.camera.motion.dolly"}],
        },
    }
    settings = PrimitiveProjectionSettings(llm_fallback_enabled=True)
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            [good], db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_invented_block_id_rejected():
    _FakeAiHub.response_text = '{"matches":[{"i":0,"block_id":"core.fake.block","confidence":0.99,"reason":"x"}]}'
    candidates = [_weak_candidate("something abstract")]
    settings = PrimitiveProjectionSettings(llm_fallback_enabled=True)
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_low_confidence_rejected():
    _FakeAiHub.response_text = '{"matches":[{"i":0,"block_id":"core.light.state.soft_warm","confidence":0.20,"reason":"weak"}]}'
    candidates = [_weak_candidate("a faint mood")]
    settings = PrimitiveProjectionSettings(
        llm_fallback_enabled=True, llm_fallback_min_confidence=0.55
    )
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_timeout_is_graceful():
    _FakeAiHub.delay = 0.2
    candidates = [_weak_candidate("the camera glides")]
    settings = PrimitiveProjectionSettings(
        llm_fallback_enabled=True, llm_fallback_timeout_ms=250
    )
    settings.llm_fallback_timeout_ms = 250  # 0.25s budget vs 0.2s delay -> ok
    _FakeAiHub.delay = 1.0  # now exceed the budget
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_malformed_json_is_graceful():
    _FakeAiHub.response_text = "not json at all"
    candidates = [_weak_candidate("the camera glides")]
    settings = PrimitiveProjectionSettings(llm_fallback_enabled=True)
    out = _run(
        enrich_candidates_with_llm_projection_fallback(
            candidates, db=None, settings=settings, primitive_index=_index()
        )
    )
    assert out[0]["primitive_projection"]["engine"] == "token_overlap_v2"


def test_catalog_is_bounded_and_deterministic():
    cat = build_primitive_catalog(_index(), cap=1)
    assert len(cat) == 1
    cat_full = build_primitive_catalog(_index(), cap=50)
    assert [c["block_id"] for c in cat_full] == sorted(
        c["block_id"] for c in cat_full
    )
    assert all("cues" in c and "op_id" in c for c in cat_full)
    # Stable across calls.
    assert build_primitive_catalog(_index(), cap=50) == cat_full
