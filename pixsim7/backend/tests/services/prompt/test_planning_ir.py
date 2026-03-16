"""Tests for the Typed Prompt Planning IR."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Dict, List
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.block.planning_ir.schema import (
    ConstraintRecord,
    PlanProvenance,
    PromptPlanIR,
    RenderPlan,
    SelectedPrimitiveRecord,
    SlotRecord,
)
from pixsim7.backend.main.services.prompt.block.planning_ir.hashing import (
    compute_plan_hash,
)
from pixsim7.backend.main.services.prompt.block.planning_ir.builder import (
    PlanBuilder,
)
from pixsim7.backend.main.services.prompt.block.planning_ir.serialization import (
    deserialize_ir,
    serialize_ir,
    verify_hash,
)

TEST_SUITE = {
    "id": "prompt-planning-ir",
    "label": "Prompt Planning IR",
    "kind": "unit",
    "category": "backend/services/prompt",
    "subcategory": "planning-ir",
    "covers": [
        "pixsim7/backend/main/services/prompt/block/planning_ir",
    ],
}


def _make_ir(**overrides: Any) -> PromptPlanIR:
    defaults = dict(
        plan_id=str(uuid4()),
        created_at="2026-03-16T00:00:00Z",
        selected_primitives=[
            SelectedPrimitiveRecord(
                primitive_id="light.golden_hour",
                target_key="slot_0_light",
                text="golden hour warm light",
                score=3.5,
                reasons=["desired_tag"],
                tags={"intensity": "5"},
            ),
        ],
        slots=[
            SlotRecord(
                slot_index=0,
                target_key="slot_0_light",
                label="Light",
                category="light",
                outcome="selected",
            ),
        ],
        constraints=[
            ConstraintRecord(
                constraint_id="c1",
                kind="requires_tag",
                target_key="slot_0_light",
                satisfied=True,
                payload={"tag": "intensity", "value": "5"},
            ),
        ],
        resolved_tags={"intensity": "5"},
        render_plan=RenderPlan(
            composition_strategy="sequential",
            final_text="golden hour warm light",
            char_count=21,
        ),
        provenance=PlanProvenance(
            compiler_id="compiler_v1",
            resolver_id="next_v1",
            seed=42,
            candidate_counts={"slot_0_light": 10},
        ),
    )
    defaults.update(overrides)
    ir = PromptPlanIR(**defaults)
    ir.deterministic_hash = compute_plan_hash(ir)
    return ir


def test_schema_validation():
    """All fields validate and the IR is constructible."""
    ir = _make_ir()
    assert ir.ir_version == "1.0.0"
    assert len(ir.selected_primitives) == 1
    assert ir.selected_primitives[0].primitive_id == "light.golden_hour"
    assert len(ir.slots) == 1
    assert ir.slots[0].outcome == "selected"
    assert len(ir.constraints) == 1
    assert ir.constraints[0].satisfied is True
    assert ir.render_plan.char_count == 21
    assert ir.provenance.seed == 42


def test_round_trip():
    """Serialize -> deserialize produces identical IR."""
    ir = _make_ir()
    json_str = serialize_ir(ir)
    restored = deserialize_ir(json_str)
    assert restored.ir_version == ir.ir_version
    assert restored.plan_id == ir.plan_id
    assert restored.deterministic_hash == ir.deterministic_hash
    assert len(restored.selected_primitives) == len(ir.selected_primitives)
    assert restored.selected_primitives[0].primitive_id == ir.selected_primitives[0].primitive_id
    assert restored.render_plan.final_text == ir.render_plan.final_text


def test_determinism():
    """Same inputs -> same hash across multiple constructions."""
    plan_id = str(uuid4())
    created = "2026-03-16T00:00:00Z"
    ir1 = _make_ir(plan_id=plan_id, created_at=created)
    ir2 = _make_ir(plan_id=plan_id, created_at=created)
    assert ir1.deterministic_hash == ir2.deterministic_hash


def test_hash_excludes_identity_fields():
    """Different plan_id and created_at still produce the same hash."""
    ir1 = _make_ir(plan_id="aaaa", created_at="2026-01-01T00:00:00Z")
    ir2 = _make_ir(plan_id="bbbb", created_at="2099-12-31T23:59:59Z")
    assert ir1.deterministic_hash == ir2.deterministic_hash


def test_hash_changes_with_content():
    """Different content produces different hash."""
    ir1 = _make_ir()
    ir2 = _make_ir(
        selected_primitives=[
            SelectedPrimitiveRecord(
                primitive_id="camera.wide_angle",
                target_key="slot_0_camera",
                text="wide angle shot",
            ),
        ],
    )
    assert ir1.deterministic_hash != ir2.deterministic_hash


def test_verify_hash():
    """verify_hash returns True for valid, False for tampered."""
    ir = _make_ir()
    assert verify_hash(ir) is True

    # Tamper with content
    ir.render_plan.final_text = "tampered"
    assert verify_hash(ir) is False


def test_builder_from_mock_data():
    """PlanBuilder.build constructs a valid IR from mock resolution data."""
    # Mock resolution request
    request = SimpleNamespace(
        resolver_id="next_v1",
        seed=42,
        candidates_by_target={
            "slot_0_light": [
                SimpleNamespace(block_id="light.golden_hour", text="golden hour"),
                SimpleNamespace(block_id="light.neon", text="neon glow"),
            ],
        },
        constraints=[
            SimpleNamespace(
                id="c1",
                kind="requires_tag",
                target_key="slot_0_light",
                payload={"tag": "intensity"},
            ),
        ],
        context={"compiler_id": "compiler_v1"},
    )

    # Mock resolution result
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
        },
        trace=SimpleNamespace(events=[
            SimpleNamespace(kind="candidate_scored", target_key="slot_0_light", data={}),
            SimpleNamespace(kind="selected", target_key="slot_0_light", data={}),
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
    ]

    ir = PlanBuilder.build(
        resolution_request=request,
        resolution_result=result,
        slot_results=slot_results,
        selected_blocks=selected_blocks,
        assembled_prompt="golden hour warm light",
        composition_strategy="sequential",
        template_id="tpl-1",
        seed=42,
    )

    assert ir.ir_version == "1.0.0"
    assert len(ir.selected_primitives) == 1
    assert ir.selected_primitives[0].primitive_id == "light.golden_hour"
    assert ir.selected_primitives[0].target_key == "slot_0_light"
    assert ir.render_plan.final_text == "golden hour warm light"
    assert ir.provenance.compiler_id == "compiler_v1"
    assert ir.provenance.resolver_id == "next_v1"
    assert ir.provenance.seed == 42
    assert ir.deterministic_hash != ""
    assert verify_hash(ir) is True


def test_empty_ir():
    """An IR with no primitives/slots is still valid."""
    ir = PromptPlanIR(
        plan_id=str(uuid4()),
        created_at="2026-03-16T00:00:00Z",
    )
    ir.deterministic_hash = compute_plan_hash(ir)
    assert ir.ir_version == "1.0.0"
    assert len(ir.selected_primitives) == 0
    assert verify_hash(ir) is True
