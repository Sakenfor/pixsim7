"""Deterministic hashing for PromptPlanIR."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .schema import PromptPlanIR


def compute_plan_hash(ir: PromptPlanIR) -> str:
    """Compute a deterministic SHA256 hash of the IR.

    Excludes plan_id, created_at, and deterministic_hash from the hash input
    so that two IRs with identical resolution content produce the same hash
    regardless of when/where they were created.
    """
    data = ir.model_dump()
    # Exclude non-deterministic identity fields
    data.pop("plan_id", None)
    data.pop("created_at", None)
    data.pop("deterministic_hash", None)

    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
