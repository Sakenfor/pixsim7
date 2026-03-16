"""End-to-end test for IR -> evaluator contribution flow."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.block.planning_ir.builder import PlanBuilder
from pixsim7.backend.main.services.prompt.block.planning_ir.serialization import (
    verify_hash,
)
from pixsim7.backend.main.services.prompt.block.evaluator import (
    _wilson_lower_bound,
)

TEST_SUITE = {
    "id": "prompt-ir-evaluator-e2e",
    "label": "Prompt IR Evaluator E2E",
    "kind": "e2e",
    "category": "backend/services/prompt",
    "subcategory": "ir-evaluator",
    "covers": [
        "pixsim7/backend/main/services/prompt/block/evaluator",
    ],
}


def _mock_resolution_data():
    """Create mock resolution request/result for e2e testing."""
    request = SimpleNamespace(
        resolver_id="next_v1",
        seed=42,
        candidates_by_target={
            "slot_0_light": [
                SimpleNamespace(block_id="light.golden_hour", text="golden hour"),
                SimpleNamespace(block_id="light.neon", text="neon glow"),
            ],
            "slot_1_camera": [
                SimpleNamespace(block_id="camera.wide", text="wide angle"),
            ],
        },
        constraints=[],
        context={"compiler_id": "compiler_v1"},
    )

    result = SimpleNamespace(
        resolver_id="next_v1",
        seed=42,
        selected_by_target={
            "slot_0_light": SimpleNamespace(
                block_id="light.golden_hour",
                text="golden hour",
                score=3.5,
                reasons=["desired_tag"],
                metadata={},
            ),
            "slot_1_camera": SimpleNamespace(
                block_id="camera.wide",
                text="wide angle",
                score=2.0,
                reasons=[],
                metadata={},
            ),
        },
        trace=SimpleNamespace(events=[
            SimpleNamespace(kind="candidate_scored", target_key="slot_0_light", data={}),
            SimpleNamespace(kind="selected", target_key="slot_0_light", data={}),
            SimpleNamespace(kind="selected", target_key="slot_1_camera", data={}),
        ]),
    )

    slot_results = [
        {
            "label": "Light",
            "status": "selected",
            "selected_block_string_id": "light.golden_hour",
            "selected_block_category": "light",
            "selected_block_role": "atmosphere",
            "selector_debug": {
                "target_key": "slot_0_light",
                "score": 3.5,
                "reasons": ["desired_tag"],
            },
        },
        {
            "label": "Camera",
            "status": "selected",
            "selected_block_string_id": "camera.wide",
            "selected_block_category": "camera",
            "selected_block_role": "composition",
            "selector_debug": {
                "target_key": "slot_1_camera",
                "score": 2.0,
                "reasons": [],
            },
        },
    ]

    selected_blocks = [
        {
            "id": "db-id-1",
            "block_id": "light.golden_hour",
            "text": "golden hour warm light",
            "category": "light",
            "role": "atmosphere",
            "tags": {"intensity": "5"},
        },
        {
            "id": "db-id-2",
            "block_id": "camera.wide",
            "text": "wide angle composition",
            "category": "camera",
            "role": "composition",
            "tags": {},
        },
    ]

    return request, result, slot_results, selected_blocks


def test_ir_build_and_verify():
    """Build IR from mock data, verify hash integrity."""
    request, result, slot_results, selected_blocks = _mock_resolution_data()

    ir = PlanBuilder.build(
        resolution_request=request,
        resolution_result=result,
        slot_results=slot_results,
        selected_blocks=selected_blocks,
        assembled_prompt="golden hour warm light. wide angle composition",
        composition_strategy="sequential",
        template_id="tpl-test",
        seed=42,
    )

    assert len(ir.selected_primitives) == 2
    assert ir.provenance.seed == 42
    assert verify_hash(ir) is True


def test_ir_primitives_to_contributions():
    """Verify IR primitives can be mapped to contribution records."""
    request, result, slot_results, selected_blocks = _mock_resolution_data()

    ir = PlanBuilder.build(
        resolution_request=request,
        resolution_result=result,
        slot_results=slot_results,
        selected_blocks=selected_blocks,
        assembled_prompt="golden hour warm light. wide angle composition",
        composition_strategy="sequential",
        seed=42,
    )

    # Simulate what record_contributions does
    run_id = uuid4()
    contribution_data = []
    for prim in ir.selected_primitives:
        contribution_data.append({
            "run_id": run_id,
            "primitive_id": prim.primitive_id,
            "target_key": prim.target_key,
            "weight": prim.score if prim.score is not None else 1.0,
            "plan_hash": ir.deterministic_hash,
        })

    assert len(contribution_data) == 2
    assert contribution_data[0]["primitive_id"] == "light.golden_hour"
    assert contribution_data[0]["plan_hash"] == ir.deterministic_hash
    assert contribution_data[1]["primitive_id"] == "camera.wide"


def test_score_computation_from_contributions():
    """Verify Wilson score computation produces expected rankings."""
    # Simulate: primitive A has 80% success rate (8/10)
    # Simulate: primitive B has 90% success rate (9/10)
    # B should rank higher
    score_a = _wilson_lower_bound(8, 10)
    score_b = _wilson_lower_bound(9, 10)
    assert score_b > score_a

    # Primitive C has 90% success rate but more samples (90/100)
    # C should rank higher than B (more confidence)
    score_c = _wilson_lower_bound(90, 100)
    assert score_c > score_b


def test_e2e_flow_integrity():
    """Full e2e: build IR -> extract contributions -> simulate outcomes -> compute scores."""
    request, result, slot_results, selected_blocks = _mock_resolution_data()

    # Step 1: Build IR
    ir = PlanBuilder.build(
        resolution_request=request,
        resolution_result=result,
        slot_results=slot_results,
        selected_blocks=selected_blocks,
        assembled_prompt="golden hour warm light. wide angle composition",
        composition_strategy="sequential",
        seed=42,
    )
    assert verify_hash(ir) is True

    # Step 2: Extract contribution data
    contributions = []
    for prim in ir.selected_primitives:
        contributions.append({
            "primitive_id": prim.primitive_id,
            "weight": prim.score if prim.score is not None else 1.0,
            "outcome": "success",
        })

    # Step 3: Compute effectiveness (simulated)
    by_primitive = {}
    for c in contributions:
        pid = c["primitive_id"]
        if pid not in by_primitive:
            by_primitive[pid] = {"successes": 0, "total": 0}
        by_primitive[pid]["total"] += 1
        if c["outcome"] == "success":
            by_primitive[pid]["successes"] += 1

    # Step 4: Verify scores
    for pid, stats in by_primitive.items():
        confidence = _wilson_lower_bound(stats["successes"], stats["total"])
        assert confidence > 0.0
        assert stats["total"] > 0
