"""Serialization utilities for PromptPlanIR."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from .hashing import compute_plan_hash

if TYPE_CHECKING:
    from .schema import PromptPlanIR


def serialize_ir(ir: PromptPlanIR) -> str:
    """Serialize a PromptPlanIR to canonical JSON."""
    return json.dumps(
        ir.model_dump(),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def deserialize_ir(json_str: str) -> PromptPlanIR:
    """Deserialize a JSON string to PromptPlanIR."""
    from .schema import PromptPlanIR

    data = json.loads(json_str)
    return PromptPlanIR.model_validate(data)


def verify_hash(ir: PromptPlanIR) -> bool:
    """Verify the deterministic_hash matches the IR content."""
    expected = compute_plan_hash(ir)
    return ir.deterministic_hash == expected
